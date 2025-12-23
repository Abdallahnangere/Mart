const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const Flutterwave = require('flutterwave-node-v3');
const axios = require('axios');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

// CONFIG
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- HELPER: AMIGO API WRAPPER ---
const deliverData = async (mobile, networkId, planId, ported = false) => {
    try {
        // Ensure IDs are integers
        const payload = { 
            network: parseInt(networkId), 
            mobile_number: mobile, 
            plan: parseInt(planId), 
            Ported_number: ported 
        };
        const response = await axios.post('https://amigo.ng/api/data/', payload, {
            headers: { 'X-API-Key': process.env.AMIGO_API_KEY, 'Content-Type': 'application/json' }
        });
        return { success: true, data: response.data };
    } catch (e) {
        return { success: false, error: e.response ? e.response.data : e.message };
    }
};

// --- PUBLIC ROUTES ---

// 1. GET DATA PLANS (Critical for "Buy Data" to work)
app.get('/api/plans', async (req, res) => {
    try {
        const plans = await prisma.dataPlan.findMany({ orderBy: { price: 'asc' } });
        res.json(plans);
    } catch (e) { res.json([]); }
});

// 2. GET PRODUCTS
app.get('/api/products', async (req, res) => {
    try {
        const products = await prisma.product.findMany({ where: { inStock: true } });
        res.json(products);
    } catch (e) { res.json([]); }
});

// 3. MAIN PAYMENT CHARGE (The Engine)
app.post('/api/pay/charge', async (req, res) => {
    const { amount, email, phone, name, type, metadata } = req.body;
    const txRef = `SAUKI-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // VALIDATION: If Data Purchase, ensure Plan exists
    if (type === 'DATA_PURCHASE') {
        if (!metadata.planId) return res.status(400).json({ error: 'No Plan Selected' });
        // Optional: Check DB if you want strict validation, but frontend usually handles selection
    }

    try {
        // Record Transaction as PENDING
        await prisma.transaction.create({
            data: {
                reference: txRef,
                type: type,
                status: 'PENDING',
                amount: parseFloat(amount),
                customerPhone: phone,
                customerName: name,
                description: metadata.desc || type,
                network: metadata.networkId ? String(metadata.networkId) : null,
                planName: metadata.planId ? String(metadata.planId) : null
            }
        });

        const payload = {
            tx_ref: txRef,
            amount: amount,
            email: email || 'guest@sauki.com',
            phone_number: phone,
            currency: "NGN",
            fullname: name,
            meta: metadata,
            is_permanent: false, // Dynamic account for one-time pay
            narration: `Sauki ${type === 'DATA_PURCHASE' ? 'Data' : 'Item'} ${phone}`
        };

        const response = await flw.Charge.bank_transfer(payload);
        
        if (response.status === 'success') {
            res.json({
                status: 'success',
                account_number: response.meta.authorization.transfer_account,
                bank_name: response.meta.authorization.transfer_bank,
                amount: response.meta.authorization.transfer_amount,
                ref: txRef,
                expiry: response.meta.authorization.expires_at
            });
        } else {
            console.error("FLW Error", response);
            res.status(400).json({ error: 'Bank System Unavailable. Retry.' });
        }
    } catch (e) {
        console.error("Charge Error", e);
        res.status(500).json({ error: 'Payment Initialization Failed' });
    }
});

// 4. CHECK STATUS (Manual Polling)
app.get('/api/transaction/check/:ref', async (req, res) => {
    const { ref } = req.params;
    try {
        const tx = await prisma.transaction.findUnique({ where: { reference: ref } });
        if (!tx) return res.json({ status: 'NOT_FOUND' });
        
        // If pending, ask Flutterwave
        if (tx.status === 'PENDING') {
            const flwRes = await flw.Transaction.verify({ id: ref });
            if (flwRes.data.status === "successful" && flwRes.data.amount >= tx.amount) {
                // MARK SUCCESS
                await prisma.transaction.update({ where: { reference: ref }, data: { status: 'SUCCESS' } });
                
                // DELIVER VALUE
                if (tx.type === 'DATA_PURCHASE') {
                    const del = await deliverData(tx.customerPhone, tx.network, tx.planName);
                    await prisma.transaction.update({ where: { reference: ref }, data: { amigoResponse: JSON.stringify(del) } });
                }
                return res.json({ status: 'SUCCESS', tx });
            }
        }
        res.json({ status: tx.status, tx });
    } catch (e) {
        res.json({ status: 'PENDING' }); // Default to pending on error
    }
});

// 5. WEBHOOK (Auto-Delivery)
app.post('/api/webhook', async (req, res) => {
    const secretHash = process.env.FLW_HASH;
    const signature = req.headers["verif-hash"];
    if (!signature || signature !== secretHash) return res.status(401).end();

    const { data } = req.body;
    
    if (data.status === "successful" || data.status === "succeeded") {
        const txRef = data.tx_ref;

        // A. AGENT FUNDING (Ref starts with AGENT-)
        if (txRef && txRef.startsWith('AGENT-')) {
            const fundingRef = `FUND-${data.id}`;
            const exists = await prisma.transaction.findUnique({ where: { reference: fundingRef } });
            
            if (!exists) {
                const agentId = txRef.replace('AGENT-', '');
                const agent = await prisma.agent.findUnique({ where: { id: agentId } });
                
                if (agent) {
                    await prisma.agent.update({
                        where: { id: agentId },
                        data: { balance: { increment: data.amount } }
                    });
                    await prisma.transaction.create({
                        data: {
                            reference: fundingRef,
                            type: 'WALLET_FUNDING',
                            status: 'SUCCESS',
                            amount: data.amount,
                            customerPhone: agent.phone,
                            customerName: agent.name,
                            description: 'Wallet Deposit',
                            agentId: agent.id
                        }
                    });
                }
            }
        } 
        // B. STANDARD PURCHASE
        else {
            const tx = await prisma.transaction.findUnique({ where: { reference: txRef } });
            if (tx && tx.status !== 'SUCCESS') {
                await prisma.transaction.update({ where: { reference: txRef }, data: { status: 'SUCCESS' } });
                
                if (tx.type === 'DATA_PURCHASE') {
                    const del = await deliverData(tx.customerPhone, tx.network, tx.planName);
                    await prisma.transaction.update({ where: { reference: txRef }, data: { amigoResponse: JSON.stringify(del) } });
                }
            }
        }
    }
    res.sendStatus(200);
});

// --- AGENT ROUTES ---

app.post('/api/agent/register', async (req, res) => {
    const { name, phone, email, pin } = req.body;
    try {
        // Check if exists
        const exists = await prisma.agent.findUnique({ where: { phone } });
        if (exists) return res.status(400).json({ error: 'Phone already registered' });

        await prisma.agent.create({ data: { name, phone, email, pin, status: 'PENDING' } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Registration Failed' }); }
});

app.post('/api/agent/login', async (req, res) => {
    const { phone, pin } = req.body;
    const agent = await prisma.agent.findUnique({ where: { phone } });
    if (agent && agent.pin === pin) {
        if (agent.status !== 'ACTIVE') return res.status(403).json({ error: 'Account pending Admin approval' });
        res.json({ success: true, agent });
    } else {
        res.status(401).json({ error: 'Invalid Credentials' });
    }
});

app.post('/api/agent/create-account', async (req, res) => {
    const { agentId } = req.body;
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    
    // Return existing if already created
    if (agent.virtualAccountNumber) return res.json({ success: true, agent });
    
    // Check BVN config
    if (!process.env.MY_BVN) return res.status(500).json({ error: 'System Config Error: BVN Missing' });

    try {
        const payload = {
            email: agent.email || `agent${agent.phone}@sauki.com`,
            is_permanent: true,
            bvn: process.env.MY_BVN,
            tx_ref: `AGENT-${agent.id}`,
            phonenumber: agent.phone,
            firstname: agent.name,
            lastname: "Agent",
            narration: `Sauki Wallet Funding`
        };
        
        const response = await flw.VirtualAccount.create(payload);
        
        if (response.status === 'success') {
            const updated = await prisma.agent.update({
                where: { id: agentId },
                data: {
                    virtualAccountBank: response.data.bank_name,
                    virtualAccountNumber: response.data.account_number,
                    virtualAccountName: "Sauki Wallet"
                }
            });
            res.json({ success: true, agent: updated });
        } else {
            res.status(400).json({ error: 'Provider failed to create account' });
        }
    } catch (e) {
        res.status(500).json({ error: 'API Error' });
    }
});

app.post('/api/agent/buy', async (req, res) => {
    const { agentId, pin, amount, networkId, planId, phone } = req.body;
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    
    if (!agent || agent.pin !== pin) return res.status(401).json({ error: 'Invalid PIN' });
    if (agent.balance < parseFloat(amount)) return res.status(400).json({ error: 'Insufficient Funds' });

    const txRef = `AGT-${Date.now()}`;
    
    // Deduct & Create TX
    await prisma.agent.update({ where: { id: agentId }, data: { balance: { decrement: parseFloat(amount) } } });
    await prisma.transaction.create({
        data: {
            reference: txRef,
            type: 'DATA_PURCHASE',
            status: 'SUCCESS',
            amount: parseFloat(amount),
            customerPhone: phone,
            customerName: agent.name,
            agentId: agent.id,
            network: String(networkId),
            planName: String(planId),
            description: 'Agent Wallet Buy'
        }
    });

    const del = await deliverData(phone, networkId, planId);
    await prisma.transaction.update({ where: { reference: txRef }, data: { amigoResponse: JSON.stringify(del) } });
    
    res.json({ success: true, txRef });
});

// --- ADMIN ROUTES (Abbreviated, keep your existing ones) ---
// (Ensure /api/admin/login, /api/admin/product/add, etc. are included as before)
// Including the SEED route again for safety:

app.get('/api/seed', async (req, res) => {
    try {
        const count = await prisma.dataPlan.count();
        if (count > 0) return res.send('Plans already exist.');
        
        await prisma.dataPlan.createMany({
            data: [
                { network: 'MTN', networkId: 1, planId: 1001, name: '1GB SME - 30 Days', price: 290 },
                { network: 'MTN', networkId: 1, planId: 6666, name: '2GB SME - 30 Days', price: 580 },
                { network: 'GLO', networkId: 2, planId: 206, name: '1GB - 30 Days', price: 300 }
            ]
        });
        res.send('Seeded!');
    } catch (e) { res.send(e.message); }
});

// --- TRACKING ---
app.get('/api/track/:phone', async (req, res) => {
    const txs = await prisma.transaction.findMany({
        where: { customerPhone: req.params.phone },
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    res.json(txs);
});

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        res.json({ success: true, token: 'admin-valid' });
    } else { res.status(401).json({ error: 'Invalid' }); }
});

// Admin Stats
app.get('/api/admin/stats', async (req, res) => {
    const totalSales = await prisma.transaction.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } });
    const pendingAgents = await prisma.agent.count({ where: { status: 'PENDING' } });
    const recentTx = await prisma.transaction.findMany({ take: 20, orderBy: { createdAt: 'desc' } });
    res.json({ revenue: totalSales._sum.amount || 0, pendingAgents, recentTx });
});

// Admin Agents
app.get('/api/admin/agents', async (req, res) => {
    const agents = await prisma.agent.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(agents);
});

// Admin Approve Agent
app.post('/api/admin/agent/approve', async (req, res) => {
    await prisma.agent.update({ where: { id: req.body.agentId }, data: { status: req.body.action } });
    res.json({ success: true });
});

// Admin Retry
app.post('/api/admin/retry', async (req, res) => {
    const { txId } = req.body;
    const tx = await prisma.transaction.findUnique({ where: { id: txId } });
    if (tx && tx.network && tx.planName) {
        const del = await deliverData(tx.customerPhone, tx.network, tx.planName);
        await prisma.transaction.update({ where: { id: txId }, data: { amigoResponse: JSON.stringify(del) } });
        return res.json({ success: true, new_response: del });
    }
    res.status(400).json({ error: 'Cannot retry' });
});

// Admin Products
app.post('/api/admin/product/add', async (req, res) => {
    const { name, price, description, image } = req.body;
    await prisma.product.create({ data: { name, price: parseFloat(price), description, image } });
    res.json({ success: true });
});

app.post('/api/admin/product/update', async (req, res) => {
    const { id, name, price, description, image } = req.body;
    const data = { name, price: parseFloat(price), description };
    if (image) data.image = image; 
    await prisma.product.update({ where: { id }, data });
    res.json({ success: true });
});

app.post('/api/admin/product/delete', async (req, res) => {
    await prisma.product.delete({ where: { id: req.body.id } });
    res.json({ success: true });
});

// Admin Plans
app.post('/api/admin/plans/add', async (req, res) => {
    const { network, networkId, planId, name, price } = req.body;
    await prisma.dataPlan.create({
        data: { network, networkId: parseInt(networkId), planId: parseInt(planId), name, price: parseFloat(price) }
    });
    res.json({ success: true });
});

app.post('/api/admin/plans/update', async (req, res) => {
    const { id, network, networkId, planId, name, price } = req.body;
    await prisma.dataPlan.update({
        where: { id },
        data: { network, networkId: parseInt(networkId), planId: parseInt(planId), name, price: parseFloat(price) }
    });
    res.json({ success: true });
});

app.post('/api/admin/plans/delete', async (req, res) => {
    await prisma.dataPlan.delete({ where: { id: req.body.id } });
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

module.exports = app;
