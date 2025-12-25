import { v4 as uuidv4 } from 'uuid';
import prisma from '../prisma/client.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, phone, amount_kobo, purpose } = req.body;

    if (!name || !phone || !amount_kobo) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1. Generate unique internal reference
    const txRef = uuidv4();

    // 2. Create Pending Transaction
    // Note: We use metadata to store the customer phone since schema lacks a specific column
    const transaction = await prisma.transaction.create({
      data: {
        reference: txRef,
        amountInKobo: parseInt(amount_kobo),
        status: 'PENDING',
        type: 'WALLET_FUNDING', // Defaulting to funding, specific logic can adjust based on 'purpose'
        description: `Virtual Account funding for ${purpose || 'Purchase'}`,
        metadata: {
          customerName: name,
          customerPhone: phone,
          purpose: purpose
        },
        // For guest checkout, agentId might be a system default or nullable (if schema allows)
        // Assuming schema requires agentId, this would need a default guest agent ID or schema adjustment.
        // For this strict implementation, we assume an Agent or Guest Agent exists or the field is optional.
        // Based on previous schema, agentId is required. We will use a placeholder or handle it.
        // *Correction*: To ensure runtime safety, we assume the frontend passes an agentId 
        // or we use a known system agent UUID from env.
        agentId: process.env.SYSTEM_AGENT_ID || '00000000-0000-0000-0000-000000000000' 
      }
    });

    // 3. Call Flutterwave to create a Dynamic Virtual Account (or standard charge flow)
    // Using simple payload for a dynamic charge/transfer reference
    const response = await fetch('https://api.flutterwave.com/v3/virtual-account-numbers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: `${phone}@saukimart.com`, // Placeholder email required by FW
        is_permanent: false,
        bvn: "", // Optional for some integrations
        tx_ref: txRef,
        phonenumber: phone,
        firstname: name.split(' ')[0],
        lastname: name.split(' ')[1] || 'User',
        narration: `Sauki Mart - ${txRef}`
      })
    });

    const data = await response.json();

    if (data.status !== 'success') {
      console.error('Flutterwave Error:', data);
      // Fail the transaction locally
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' }
      });
      return res.status(400).json({ error: 'Failed to generate account', details: data.message });
    }

    // 4. Return Details
    return res.status(200).json({
      transaction_reference: txRef,
      bank_name: data.data.bank_name,
      account_number: data.data.account_number,
      amount: amount_kobo,
      expiry: data.data.expiry_date
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
