const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// --- SECRETS FROM ENV ---
const AMIGO_URL = 'https://amigo.ng/api/data/';
const AMIGO_KEY = process.env.AMIGO_API_KEY; 
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;

// --- AUTH MIDDLEWARE ---
const isAdmin = (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth) return res.status(401).json({ error: "No Token" });

    const b64auth = auth.split(' ')[1];
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login === ADMIN_EMAIL && password === ADMIN_PASS) {
        next();
    } else {
        res.status(401).json({ error: "Invalid Credentials" });
    }
};

// --- CUSTOMER ROUTES ---

// Init Purchase
app.post('/api/buy/init', async (req, res) => {
    // 1. Log incoming request for debugging
    console.log("Init Request Body:", req.body);

    const { amount, phone, type, networkId, planId, productId, productName } = req.body;
    const ref = `SAUKI-${Date.now()}-${Math.floor(Math.random()*1000)}`;

    try {
        // 2. Create Transaction with Safe Type Conversions
        // We convert IDs to Number() and amount to String() to satisfy Prisma/Decimal requirements
        const tx = await prisma.transaction.create({
            data: {
                reference: ref, 
                type: type || 'data', 
                status: 'pending', 
                amount: String(amount), // Prisma Decimal prefers String
                customerPhone: String(phone),
                networkId: networkId ? Number(networkId) : null,
                planId: planId ? Number(planId) : null,
                productId: productId ? Number(productId) : null,
                productName: productName || null
            }
        });
        
        console.log("Transaction Created:", tx.id);
        res.json({ success: true, reference: ref });

    } catch (e) { 
        // 3. Return exact error to frontend
        console.error("DB Init Error:", e);
        res.status(500).json({ error: "DB Error: " + e.message }); 
    }
});

// Verify & Deliver
app.post('/api/buy/verify', async (req, res) => {
    const { reference } = req.body;
    try {
        const tx = await prisma.transaction.findUnique({ where: { reference } });
        if (!tx) return res.status(404).json({ error: "Not Found" });
        if (tx.status === 'delivered') return res.json({ payment: true, delivery: true, tx });

        // MOCK PAYMENT CHECK (Replace with FLW verify in production)
        const isPaid = true; 

        if (isPaid) {
            if (tx.status === 'pending') await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'paid' } });

            if (tx.type === 'data') {
                try {
                    console.log("Calling Amigo for:", tx.reference);
                    const amigo = await axios.post(AMIGO_URL, {
                        network: tx.networkId, mobile_number: tx.customerPhone,
                        plan: tx.planId, Ported_number: false
                    }, {
                        headers: { 'X-API-Key': AMIGO_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': tx.id }
                    });
                    
                    await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'delivered', amigoResponse: JSON.stringify(amigo.data) } });
                    return res.json({ payment: true, delivery: true, tx });
                } catch (err) {
                    console.error("Amigo Error:", err.response?.data || err.message);
                    return res.json({ payment: true, delivery: false });
                }
            }
            return res.json({ payment: true, delivery: true, tx }); // Device
        }
        return res.json({ payment: false, delivery: false });
    } catch (e) {
        console.error("Verify Error:", e);
        res.status(500).json({ error: "Verification failed" });
    }
});

// Getters
app.get('/api/plans', async (req, res) => {
    try {
        const plans = await prisma.dataPlan.findMany({ orderBy: { price: 'asc' }});
        res.json(plans);
    } catch (e) {
        console.error("Fetch Plans Error:", e);
        res.status(500).json([]);
    }
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

// --- ADMIN ROUTES ---
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
    
    try {
        const amigo = await axios.post(AMIGO_URL, {
            network: tx.networkId, mobile_number: tx.customerPhone, plan: tx.planId, Ported_number: false
        }, { headers: { 'X-API-Key': AMIGO_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': tx.id } });
        
        await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'delivered', amigoResponse: JSON.stringify(amigo.data) } });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ error: "Retry Failed" }); }
});

app.post('/api/admin/plan', isAdmin, async (req, res) => {
    const { network, planId, name, price } = req.body;
    await prisma.dataPlan.create({ data: { network: Number(network), planId: Number(planId), name, price: String(price) } });
    res.json({ success: true });
});

app.post('/api/admin/product', isAdmin, async (req, res) => {
    const { name, price, image } = req.body;
    await prisma.product.create({ data: { name, description: "", price: String(price), image } });
    res.json({ success: true });
});

module.exports = app;
