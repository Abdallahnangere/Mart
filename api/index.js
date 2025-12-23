const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const Flutterwave = require('flutterwave-node-v3');
const axios = require('axios');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

app.use(cors());
app.use(express.json());

// ==========================================
// 1. THE WEBHOOK (Critical for Auto-Delivery)
// ==========================================

app.post('/api/webhook', async (req, res) => {
    // 1. Validate Secret Hash (Security)
    const secretHash = process.env.FLW_HASH;
    const signature = req.headers["verif-hash"];
    
    if (!signature || signature !== secretHash) {
        return res.status(401).end();
    }

    const { data } = req.body;

    // 2. Handle Successful Payment
    if (data.status === "successful" && data.tx_ref) {
        const txRef = data.tx_ref;

        try {
            // 3. Find Transaction
            const tx = await prisma.transaction.findUnique({ where: { reference: txRef } });

            // 4. If exists and not yet marked success
            if (tx && tx.status !== 'SUCCESS') {
                
                // Mark as Paid immediately to prevent double processing
                await prisma.transaction.update({
                    where: { reference: txRef },
                    data: { status: 'SUCCESS' }
                });

                // 5. IF DATA PURCHASE -> DELIVER VIA AMIGO
                if (tx.type === 'DATA_PURCHASE' && tx.network && tx.planName) {
                    
                    // We stored networkId and PlanId in the DB or need to map them
                    // Assuming we passed them in metadata during charge init, 
                    // ideally we should store them in specific columns, but here we parse or fetch.
                    
                    // NOTE: In the /charge endpoint below, we save network/plan to the DB columns.
                    // Converting network string to ID (simple mapping for safety)
                    const networkMap = { 'MTN': 1, 'GLO': 2, 'AIRTEL': 3, '1': 1, '2': 2 };
                    const netId = networkMap[tx.network] || 1;
                    
                    // The plan ID is usually stored in description or a dedicated column. 
                    // For this robust version, we assume the 'planName' column actually holds the Plan ID 
                    // (See the /charge route update below to ensure this).
                    const planId = parseInt(tx.planName); 

                    const payload = {
                        network: netId,
                        mobile_number: tx.customerPhone,
                        plan: planId,
                        Ported_number: false
                    };

                    // Call Amigo API
                    const amigoRes = await axios.post('https://amigo.ng/api/data/', payload, {
                        headers: {
                            'X-API-Key': process.env.AMIGO_API_KEY,
                            'Content-Type': 'application/json'
                        }
                    });

                    // Update Transaction with Delivery Status
                    if (amigoRes.data.status === 'delivered' || amigoRes.data.success) {
                        await prisma.transaction.update({
                            where: { reference: txRef },
                            data: { description: tx.description + " [DELIVERED]" }
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Webhook processing error:", err);
        }
    }

    // Always return 200 OK to Flutterwave
    res.sendStatus(200);
});


// ==========================================
// 2. PUBLIC API ROUTES
// ==========================================

// Get Products
app.get('/api/products', async (req, res) => {
    try {
        const products = await prisma.product.findMany({ where: { inStock: true } });
        res.json(products);
    } catch (e) { res.status(500).json({ error: 'Server Error' }); }
});

// Initialize Payment
app.post('/api/pay/charge', async (req, res) => {
    const { amount, email, phone, name, type, metadata } = req.body;
    const txRef = `SAUKI-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    try {
        // Save to DB
        await prisma.transaction.create({
            data: {
                reference: txRef,
                type: type,
                status: 'PENDING',
                amount: parseFloat(amount),
                customerPhone: phone,
                customerName: name,
                description: metadata.desc,
                network: String(metadata.networkId), // Storing ID "1" or "2"
                planName: String(metadata.planId)    // Storing ID "1001" etc for Amigo
            }
        });

        const payload = {
            tx_ref: txRef,
            amount: amount,
            email: email,
            phone_number: phone,
            currency: "NGN",
            fullname: name,
            meta: metadata,
            is_permanent: false,
            narration: `Sauki Data - ${phone}`
        };

        const response = await flw.Charge.bank_transfer(payload);
        
        if (response.status === 'success') {
            res.json({
                status: 'success',
                account_number: response.meta.authorization.transfer_account,
                bank_name: response.meta.authorization.transfer_bank,
                amount: response.meta.authorization.transfer_amount,
                ref: txRef
            });
        } else {
            res.status(400).json({ error: 'Failed to generate account' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Payment Init Failed' });
    }
});

// Transaction Status Check (Manual Polling)
app.get('/api/transaction/check/:ref', async (req, res) => {
    const { ref } = req.params;
    try {
        const tx = await prisma.transaction.findUnique({ where: { reference: ref } });
        if (!tx) return res.json({ status: 'NOT_FOUND' });
        
        // If pending, ask Flutterwave (Backup check)
        if (tx.status === 'PENDING') {
            const flwRes = await flw.Transaction.verify({ id: ref });
            if (flwRes.data.status === "successful" && flwRes.data.amount >= tx.amount) {
                 await prisma.transaction.update({
                    where: { reference: ref },
                    data: { status: 'SUCCESS' }
                });
                return res.json({ status: 'SUCCESS', tx });
            }
        }
        res.json({ status: tx.status, tx });
    } catch (e) {
        res.json({ status: 'PENDING' });
    }
});

// Track History
app.get('/api/track/:phone', async (req, res) => {
    const txs = await prisma.transaction.findMany({
        where: { customerPhone: req.params.phone },
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    res.json(txs);
});

// ==========================================
// 3. ADMIN ROUTES
// ==========================================

app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        res.json({ success: true, token: 'admin-valid' });
    } else { res.status(401).json({ error: 'Invalid' }); }
});

app.get('/api/admin/stats', async (req, res) => {
    const totalSales = await prisma.transaction.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } });
    const pendingAgents = await prisma.agent.count({ where: { status: 'PENDING' } });
    const recentTx = await prisma.transaction.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
    res.json({ revenue: totalSales._sum.amount || 0, pendingAgents, recentTx });
});

app.get('/api/admin/agents', async (req, res) => {
    const agents = await prisma.agent.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(agents);
});

app.post('/api/admin/agent/approve', async (req, res) => {
    const { agentId, action } = req.body;
    await prisma.agent.update({ where: { id: agentId }, data: { status: action } });
    res.json({ success: true });
});

app.post('/api/admin/product/add', async (req, res) => {
    const { name, price, description, image } = req.body;
    await prisma.product.create({ data: { name, price: parseFloat(price), description, image } });
    res.json({ success: true });
});

app.post('/api/admin/product/delete', async (req, res) => {
    await prisma.product.delete({ where: { id: req.body.id } });
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

module.exports = app;
