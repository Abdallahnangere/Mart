const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const Flutterwave = require('flutterwave-node-v3');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();

// --- CONFIGURATION ---
const AMIGO_URL = 'https://amigo.ng/api/data/';
const AMIGO_KEY = process.env.AMIGO_API_KEY; 
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;

// Flutterwave Config
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);
const FLW_HASH = process.env.FLW_HASH; // Required for Webhook security

app.use(cors());
app.use(express.json());

// --- HELPER: AMIGO DELIVERY ---
// Isolated function to handle data delivery to ensure reusability
async function deliverData(tx) {
    // Parse metadata to get plan IDs
    let meta = {};
    try { meta = JSON.parse(tx.description || '{}'); } catch(e) {}

    const payload = {
        network: meta.networkId, 
        mobile_number: tx.customerPhone,
        plan: meta.planId,
        Ported_number: false
    };

    console.log(`Attempting Delivery for ${tx.reference}...`);

    try {
        const amigo = await axios.post(AMIGO_URL, payload, {
            headers: { 
                'X-API-Key': AMIGO_KEY, 
                'Content-Type': 'application/json', 
                'Idempotency-Key': tx.id // Prevents double delivery for same tx
            }
        });
        
        // Update Transaction to Delivered
        await prisma.transaction.update({ 
            where: { id: tx.id }, 
            data: { 
                status: 'delivered', 
                amigoResponse: JSON.stringify(amigo.data) 
            } 
        });
        console.log(`Delivery Success: ${tx.reference}`);
        return { success: true, data: amigo.data };

    } catch (err) {
        console.error(`Delivery Failed for ${tx.reference}:`, err.response?.data || err.message);
        // Log failure but keep status as 'paid' so admin can retry
        return { success: false, error: err.response?.data };
    }
}

// --- AUTH MIDDLEWARE ---
const isAdmin = (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth) return res.status(401).json({ error: "No Token" });
    const b64auth = auth.split(' ')[1];
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === ADMIN_EMAIL && password === ADMIN_PASS) next();
    else res.status(401).json({ error: "Invalid Credentials" });
};

// --- CUSTOMER ROUTES ---

// 1. INIT PURCHASE (Generates DVA if possible)
app.post('/api/buy/init', async (req, res) => {
    console.log("Init Order:", req.body);
    const { amount, phone, type, networkId, planId, productId, productName } = req.body;
    
    // Unique Reference
    const ref = `SAUKI-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const email = `customer${phone}@sauki.com`; // Placeholder email for DVA

    // Metadata for delivery
    const metadata = {
        networkId: networkId ? Number(networkId) : null,
        planId: planId ? Number(planId) : null,
        productId: productId ? Number(productId) : null
    };

    try {
        // A. Attempt to create a Flutterwave Virtual Account for this transaction
        // Note: This requires your FLW account to have Virtual Accounts enabled
        let bankDetails = { bank: "Transfer to Admin", account: "Contact Support" };
        
        try {
            const payload = {
                email: email,
                is_permanent: false, // Temporary account for this transaction
                tx_ref: ref,
                phonenumber: phone,
                firstname: 'Sauki',
                lastname: 'Customer',
                narration: `Sauki Mart ${productName}`
            };
            
            const response = await flw.VirtualAccount.create(payload);
            if(response.status === 'success' && response.data) {
                bankDetails = {
                    bank: response.data.bank_name,
                    account: response.data.account_number
                };
                // Store bank details in metadata for frontend retrieval if needed
                metadata.bankDetails = bankDetails;
            }
        } catch (flwErr) {
            console.warn("FLW DVA Creation Failed (Using fallback):", flwErr.message);
            // Fallback: You might want to return your main company account here if DVA fails
        }

        // B. Create Database Record
        const tx = await prisma.transaction.create({
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
        
        // C. Return Details to Frontend
        res.json({ 
            success: true, 
            reference: ref,
            bankName: bankDetails.bank,
            accountNumber: bankDetails.account
        });

    } catch (e) { 
        console.error("Init Error:", e);
        res.status(500).json({ error: "System Error: " + e.message }); 
    }
});

// 2. WEBHOOK (The Brain) - Handles Payment Confirmation
app.post('/api/webhook/flw', async (req, res) => {
    // A. Verify Signature
    const signature = req.headers['verif-hash'];
    if (!signature || signature !== FLW_HASH) {
        return res.status(401).end();
    }

    const payload = req.body;
    
    // B. Check for Successful Charge
    if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
        const { tx_ref, amount } = payload.data;
        
        console.log(`Webhook Received for ${tx_ref}`);

        try {
            // C. Find Transaction
            const tx = await prisma.transaction.findUnique({ where: { reference: tx_ref } });
            
            if (tx && (tx.status === 'pending' || tx.status === 'failed')) {
                
                // D. Security Check: Amount
                if (parseFloat(amount) < tx.amount) {
                    console.error("Fraud Alert: Insufficient amount paid");
                    return res.status(400).end();
                }

                // E. Mark as Paid
                await prisma.transaction.update({ 
                    where: { id: tx.id }, 
                    data: { status: 'paid' } 
                });

                // F. Trigger Delivery (If it's a data plan)
                if (tx.type === 'data') {
                    await deliverData(tx);
                }
            }
        } catch (e) {
            console.error("Webhook Processing Error:", e);
        }
    }

    res.status(200).end(); // Always acknowledge webhook
});

// 3. VERIFY (Frontend Polling)
app.post('/api/buy/verify', async (req, res) => {
    const { reference } = req.body;
    try {
        const tx = await prisma.transaction.findUnique({ where: { reference } });
        
        if (!tx) return res.status(404).json({ error: "Not Found" });
        
        // Scenario A: Webhook already handled it
        if (tx.status === 'delivered') {
            return res.json({ payment: true, delivery: true, tx });
        }
        
        // Scenario B: Paid but Delivery Failed/Pending
        if (tx.status === 'paid') {
            return res.json({ payment: true, delivery: false, message: "Payment received. Processing data..." });
        }

        // Scenario C: Still Pending (User might be clicking button eagerly)
        // In a live DVA flow, we usually wait for webhook. 
        // But we can check FLW just in case webhook failed.
        if (tx.status === 'pending') {
             // Optional: Force check FLW verify here if critical, 
             // but usually strictly relying on Webhook is safer for DVA.
             return res.json({ payment: false, delivery: false });
        }

        return res.json({ payment: false, delivery: false });

    } catch (e) {
        res.status(500).json({ error: "Verification failed" });
    }
});

// --- DATA & PRODUCTS ---
app.get('/api/plans', async (req, res) => {
    try {
        const plans = await prisma.dataPlan.findMany({ orderBy: { price: 'asc' }});
        res.json(plans);
    } catch (e) { res.status(500).json([]); }
});

app.get('/api/products', async (req, res) => {
    try {
        const prods = await prisma.product.findMany();
        res.json(prods);
    } catch (e) { res.status(500).json([]); }
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

// --- ADMIN ---
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

// Manual Retry by Admin (If webhook missed or Amigo failed)
app.post('/api/admin/retry', isAdmin, async (req, res) => {
    const { id } = req.body;
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if(!tx) return res.status(404).json({error: "Not Found"});
    
    // Manual Delivery
    const result = await deliverData(tx);
    
    if(result.success) res.json({ success: true });
    else res.status(500).json({ error: "Retry Failed", details: result.error });
});

app.post('/api/admin/plan', isAdmin, async (req, res) => {
    const { network, planId, name, price } = req.body;
    try {
        await prisma.dataPlan.create({ 
            data: { 
                network: String(network), 
                networkId: Number(network),
                planId: Number(planId),     
                name, 
                price: parseFloat(price)
            } 
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
