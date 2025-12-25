const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const Flutterwave = require('flutterwave-node-v3');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();

// --- CONFIGURATION ---
const AMIGO_URL = 'process.env.AMIGO_BASE_URL;
const AMIGO_KEY = process.env.AMIGO_API_KEY; 
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;

// Flutterwave Config
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);
const FLW_HASH = process.env.FLW_HASH; 

app.use(cors());
app.use(express.json());

// --- HELPER: AMIGO DELIVERY ---
async function deliverData(tx) {
    let meta = {};
    try { meta = JSON.parse(tx.description || '{}'); } catch(e) {}

    const payload = {
        network: meta.networkId, 
        mobile_number: tx.customerPhone,
        plan: meta.planId,
        Ported_number: false
    };

    console.log(`[Amigo] Attempting Delivery for ${tx.reference}...`);

    try {
        const amigo = await axios.post(AMIGO_URL, payload, {
            headers: { 
                'X-API-Key': AMIGO_KEY, 
                'Content-Type': 'application/json', 
                'Idempotency-Key': tx.id 
            }
        });
        
        await prisma.transaction.update({ 
            where: { id: tx.id }, 
            data: { 
                status: 'delivered', 
                amigoResponse: JSON.stringify(amigo.data) 
            } 
        });
        console.log(`[Amigo] Delivery Success: ${tx.reference}`);
        return { success: true, data: amigo.data };

    } catch (err) {
        console.error(`[Amigo] Delivery Failed for ${tx.reference}:`, err.response?.data || err.message);
        return { success: false, error: err.response?.data };
    }
}

// --- AUTH MIDDLEWARE (For Admin API routes only) ---
const isAdmin = (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth) return res.status(401).json({ error: "No Token" });
    const b64auth = auth.split(' ')[1];
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === ADMIN_EMAIL && password === ADMIN_PASS) next();
    else res.status(401).json({ error: "Invalid Credentials" });
};

// --- ROUTES ---

// 1. INIT PURCHASE (Fixes 'is_permanent' error)
app.post('/api/buy/init', async (req, res) => {
    console.log("[Init] Request:", req.body);
    const { amount, phone, type, networkId, planId, productId, productName } = req.body;
    
    const ref = `SAUKI-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const userEmail = `user${phone}@sauki-temp.com`; 

    const metadata = {
        networkId: networkId ? Number(networkId) : null,
        planId: planId ? Number(planId) : null,
        productId: productId ? Number(productId) : null
    };

    try {
        // FIXED: Removed 'is_permanent' which caused the error
        const flwPayload = {
            tx_ref: ref,
            amount: String(amount),
            email: userEmail,
            phone_number: phone,
            currency: "NGN",
            client_ip: req.ip || "127.0.0.1",
            device_fingerprint: "sauki-web-app",
            fullname: "Sauki Customer",
            narration: `Sauki ${productName}`
        };

        // Generate Dynamic Bank Account
        const flwResponse = await flw.Charge.bank_transfer(flwPayload);
        
        if (flwResponse.status !== 'success' || !flwResponse.meta || !flwResponse.meta.authorization) {
             console.error("[FLW Error]", flwResponse);
             throw new Error("Could not generate account number from Flutterwave");
        }

        const bankDetails = flwResponse.meta.authorization;

        await prisma.transaction.create({
            data: {
                reference: ref, 
                type: type || 'data', 
                status: 'pending', 
                amount: parseFloat(amount), 
                customerPhone: String(phone),
                network: networkId === 1 ? 'MTN' : (networkId === 2 ? 'GLO' : 'Other'),
                planName: productName || null,
                description: JSON.stringify(metadata)
            }
        });
        
        res.json({ 
            success: true, 
            reference: ref,
            bankName: bankDetails.transfer_bank,
            accountNumber: bankDetails.transfer_account,
            accountName: "Sauki Mart", 
            payableAmount: bankDetails.transfer_amount
        });

    } catch (e) { 
        console.error("[Init Error]", e);
        res.status(500).json({ error: "System Error: " + e.message }); 
    }
});

// 2. WEBHOOK
app.post('/api/webhook/flw', async (req, res) => {
    const signature = req.headers['verif-hash'];
    if (!signature || signature !== FLW_HASH) return res.status(401).end();

    const payload = req.body;
    
    if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
        const { tx_ref, amount } = payload.data;
        console.log(`[Webhook] Payment confirmed for ${tx_ref}`);

        try {
            const tx = await prisma.transaction.findUnique({ where: { reference: tx_ref } });
            
            if (tx && (tx.status === 'pending' || tx.status === 'failed')) {
                if (parseFloat(amount) < tx.amount) return res.status(400).end();

                await prisma.transaction.update({ 
                    where: { id: tx.id }, 
                    data: { status: 'paid' } 
                });

                if (tx.type === 'data') {
                    await deliverData(tx);
                }
            }
        } catch (e) { console.error("[Webhook] Error:", e); }
    }
    res.status(200).end(); 
});

// 3. VERIFY
app.post('/api/buy/verify', async (req, res) => {
    const { reference } = req.body;
    try {
        const tx = await prisma.transaction.findUnique({ where: { reference } });
        if (!tx) return res.status(404).json({ error: "Not Found" });
        
        if (tx.status === 'delivered') return res.json({ payment: true, delivery: true, tx });
        
        if (tx.status === 'paid') {
            if(tx.type === 'data' && !tx.amigoResponse) await deliverData(tx);
            return res.json({ payment: true, delivery: false, message: "Processing data..." });
        }
        return res.json({ payment: false, delivery: false });

    } catch (e) { res.status(500).json({ error: "Verification failed" }); }
});

// --- PUBLIC DATA ---
app.get('/api/plans', async (req, res) => {
    try {
        const plans = await prisma.dataPlan.findMany({ orderBy: { price: 'asc' }});
        res.json(plans);
    } catch (e) { res.status(500).json([]); }
});

// FIXED: Ensures products can be fetched by frontend
app.get('/api/products', async (req, res) => {
    try {
        const prods = await prisma.product.findMany({
            where: { inStock: true }
        });
        res.json(prods);
    } catch (e) { 
        console.error("Product Fetch Error", e);
        res.status(500).json([]); 
    }
});

app.get('/api/track/:phone', async (req, res) => {
    try {
        const txs = await prisma.transaction.findMany({
            where: { customerPhone: req.params.phone },
            take: 3, orderBy: { createdAt: 'desc' }
        });
        res.json(txs);
    } catch (e) { res.status(500).json([]); }
});

// --- ADMIN ROUTES (Protected) ---
// Keep these for your admin.html to use
app.post('/api/admin/login', (req, res) => {
    const { u, p } = req.body;
    if(u === ADMIN_EMAIL && p === ADMIN_PASS) {
        const token = Buffer.from(`${u}:${p}`).toString('base64');
        res.json({ success: true, token: `Basic ${token}` });
    } else {
        res.status(401).json({ error: "Invalid Credentials" });
    }
});

app.get('/api/admin/transactions', isAdmin, async (req, res) => {
    const txs = await prisma.transaction.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(txs);
});

app.post('/api/admin/retry', isAdmin, async (req, res) => {
    const { id } = req.body;
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if(!tx) return res.status(404).json({error: "Not Found"});
    
    const result = await deliverData(tx);
    if(result.success) res.json({ success: true });
    else res.status(500).json({ error: "Retry Failed", details: result.error });
});

app.post('/api/admin/plan', isAdmin, async (req, res) => {
    const { network, planId, name, price } = req.body;
    try {
        await prisma.dataPlan.create({ 
            data: { network: String(network), networkId: Number(network), planId: Number(planId), name, price: parseFloat(price) } 
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/product', isAdmin, async (req, res) => {
    const { name, price, image } = req.body;
    try {
        await prisma.product.create({ 
            data: { name, description: "", price: parseFloat(price), image } 
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
