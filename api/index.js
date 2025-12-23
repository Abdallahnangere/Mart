const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const Flutterwave = require('flutterwave-node-v3');
const axios = require('axios');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

// INCREASE LIMIT FOR IMAGE UPLOAD
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- UTILS ---
const deliverData = async (mobile, networkId, planId, ported = false) => {
    try {
        const payload = { network: parseInt(networkId), mobile_number: mobile, plan: parseInt(planId), Ported_number: ported };
        const response = await axios.post('https://amigo.ng/api/data/', payload, {
            headers: { 'X-API-Key': process.env.AMIGO_API_KEY, 'Content-Type': 'application/json' }
        });
        return { success: true, data: response.data };
    } catch (e) {
        return { success: false, error: e.response ? e.response.data : e.message };
    }
};

// --- 1. PUBLIC ROUTES ---
app.get('/api/plans', async (req, res) => {
    try {
        const plans = await prisma.dataPlan.findMany({ orderBy: { price: 'asc' } });
        res.json(plans);
    } catch (e) { res.status(500).json([]); }
});

app.get('/api/products', async (req, res) => {
    const products = await prisma.product.findMany({ where: { inStock: true } });
    res.json(products);
});

app.post('/api/pay/charge', async (req, res) => {
    const { amount, email, phone, name, type, metadata } = req.body;
    const txRef = `SAUKI-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    try {
        await prisma.transaction.create({
            data: {
                reference: txRef,
                type: type,
                status: 'PENDING',
                amount: parseFloat(amount),
                customerPhone: phone,
                customerName: name,
                description: metadata.desc,
                network: String(metadata.networkId),
                planName: String(metadata.planId)
            }
        });

        const payload = {
            tx_ref: txRef,
            amount: amount,
            email: email || 'customer@sauki.com',
            phone_number: phone,
            currency: "NGN",
            fullname: name,
            meta: metadata,
            is_permanent: false,
            narration: `Sauki Data ${phone}`
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
            res.status(400).json({ error: 'Bank System Busy' });
        }
    } catch (e) {
        res.status(500).json({ error: 'System Error' });
    }
});

app.get('/api/transaction/check/:ref', async (req, res) => {
    const { ref } = req.params;
    const tx = await prisma.transaction.findUnique({ where: { reference: ref } });
    if (!tx) return res.json({ status: 'NOT_FOUND' });
    
    if (tx.status === 'PENDING') {
        try {
            const flwRes = await flw.Transaction.verify({ id: ref });
            if (flwRes.data.status === "successful" && flwRes.data.amount >= tx.amount) {
                await prisma.transaction.update({ where: { reference: ref }, data: { status: 'SUCCESS' } });
                if (tx.type === 'DATA_PURCHASE') {
                    const del = await deliverData(tx.customerPhone, tx.network, tx.planName);
                    await prisma.transaction.update({ where: { reference: ref }, data: { amigoResponse: JSON.stringify(del) } });
                }
                return res.json({ status: 'SUCCESS', tx });
            }
        } catch (e) {}
    }
    res.json({ status: tx.status, tx });
});

// ==========================================
// THE CRITICAL WEBHOOK (HANDLES INSTANT WALLET FUNDING)
// ==========================================
app.post('/api/webhook', async (req, res) => {
    const secretHash = process.env.FLW_HASH;
    const signature = req.headers["verif-hash"];
    if (!signature || signature !== secretHash) return res.status(401).end();

    const { data } = req.body;
    
    if (data.status === "successful" || data.status === "succeeded") {
        const txRef = data.tx_ref;

        // 1. HANDLE AGENT WALLET FUNDING (Static Accounts)
        // Static accounts always have ref like "AGENT-{uuid}"
        if (txRef && txRef.startsWith('AGENT-')) {
            // We use the FLW transaction ID as our unique reference to prevent double crediting
            const fundingRef = `FUND-${data.id}`;
            
            const exists = await prisma.transaction.findUnique({ where: { reference: fundingRef } });
            
            if (!exists) {
                const agentId = txRef.replace('AGENT-', '');
                const agent = await prisma.agent.findUnique({ where: { id: agentId } });
                
                if (agent) {
                    // Credit Wallet
                    await prisma.agent.update({
                        where: { id: agentId },
                        data: { balance: { increment: data.amount } }
                    });

                    // Record Transaction
                    await prisma.transaction.create({
                        data: {
                            reference: fundingRef,
                            type: 'WALLET_FUNDING',
                            status: 'SUCCESS',
                            amount: data.amount,
                            customerPhone: agent.phone,
                            customerName: agent.name,
                            description: 'Wallet Funding via Transfer',
                            agentId: agent.id
                        }
                    });
                }
            }
        } 
        // 2. HANDLE REGULAR TRANSACTIONS (Data/Device purchase)
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

// --- 2. AGENT ROUTES ---
app.post('/api/agent/register', async (req, res) => {
    const { name, phone, email, pin } = req.body;
    try {
        await prisma.agent.create({ data: { name, phone, email, pin, status: 'PENDING' } });
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: 'Phone already registered' }); }
});

app.post('/api/agent/login', async (req, res) => {
    const { phone, pin } = req.body;
    const agent = await prisma.agent.findUnique({ where: { phone } });
    if (agent && agent.pin === pin) {
        if (agent.status !== 'ACTIVE') return res.status(403).json({ error: 'Account pending approval' });
        res.json({ success: true, agent });
    } else { res.status(401).json({ error: 'Invalid credentials' }); }
});

app.post('/api/agent/create-account', async (req, res) => {
    const { agentId } = req.body;
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (agent.virtualAccountNumber) return res.json({ success: true, agent });
    
    // REQUIRE BVN
    if (!process.env.MY_BVN) return res.status(500).json({ error: 'Server Config Error: BVN missing' });

    try {
        const payload = {
            email: agent.email || `agent${agent.phone}@sauki.com`,
            is_permanent: true,
            bvn: process.env.MY_BVN, // USES THE ENV VARIABLE
            tx_ref: `AGENT-${agent.id}`,
            phonenumber: agent.phone,
            firstname: agent.name,
            lastname: "Agent",
            narration: `Sauki Wallet Topup`
        };
        
        const response = await flw.VirtualAccount.create(payload);
        
        if (response.status === 'success') {
            const updated = await prisma.agent.update({
                where: { id: agentId },
                data: {
                    virtualAccountBank: response.data.bank_name,
                    virtualAccountNumber: response.data.account_number,
                    virtualAccountName: "Sauki Agent Wallet"
                }
            });
            res.json({ success: true, agent: updated });
        } else { res.status(400).json({ error: 'Could not create static account' }); }
    } catch (e) { 
        console.error("FLW Account Error:", e.response?.data || e.message);
        res.status(500).json({ error: 'Provider Error' }); 
    }
});

app.post('/api/agent/buy', async (req, res) => {
    const { agentId, pin, amount, networkId, planId, phone } = req.body;
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    
    if (!agent || agent.pin !== pin) return res.status(401).json({ error: 'Invalid PIN' });
    if (agent.balance < amount) return res.status(400).json({ error: 'Insufficient Balance' });

    const txRef = `AGT-${Date.now()}`;
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
            description: 'Agent Wallet Purchase'
        }
    });

    const del = await deliverData(phone, networkId, planId);
    await prisma.transaction.update({ where: { reference: txRef }, data: { amigoResponse: JSON.stringify(del) } });
    res.json({ success: true, txRef });
});

// --- 3. ADMIN ROUTES ---
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        res.json({ success: true, token: 'admin-valid' });
    } else { res.status(401).json({ error: 'Invalid' }); }
});

app.get('/api/admin/stats', async (req, res) => {
    const totalSales = await prisma.transaction.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true } });
    const pendingAgents = await prisma.agent.count({ where: { status: 'PENDING' } });
    const recentTx = await prisma.transaction.findMany({ take: 20, orderBy: { createdAt: 'desc' } });
    res.json({ revenue: totalSales._sum.amount || 0, pendingAgents, recentTx });
});

app.get('/api/admin/agents', async (req, res) => {
    const agents = await prisma.agent.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(agents);
});

app.post('/api/admin/agent/approve', async (req, res) => {
    await prisma.agent.update({ where: { id: req.body.agentId }, data: { status: req.body.action } });
    res.json({ success: true });
});

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

// -- PRODUCTS --
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

// -- PLANS --
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

app.get('/api/track/:phone', async (req, res) => {
    const txs = await prisma.transaction.findMany({
        where: { customerPhone: req.params.phone },
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    res.json(txs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

module.exports = app;
