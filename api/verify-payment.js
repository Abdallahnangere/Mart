import prisma from '../prisma/client.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transaction_reference } = req.body;

    if (!transaction_reference) {
      return res.status(400).json({ error: 'Transaction reference required' });
    }

    // 1. Find Transaction
    const transaction = await prisma.transaction.findUnique({
      where: { reference: transaction_reference }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status === 'SUCCESS' || transaction.status === 'PAID') {
      return res.status(200).json({ 
        status: 'SUCCESS', 
        amount: transaction.amountInKobo, 
        message: 'Transaction already verified' 
      });
    }

    // 2. Call Flutterwave Verify API
    // Note: If using Virtual Accounts, we often verify by the tx_ref passed during creation
    const flwResponse = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${transaction_reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
      }
    });

    const flwData = await flwResponse.json();

    // 3. Check Verification Status
    if (flwData.status === 'success' && 
        flwData.data.status === 'successful' && 
        flwData.data.amount >= (transaction.amountInKobo / 100)) {
      
      // 4. Update Transaction
      const updatedTx = await prisma.transaction.update({
        where: { id: transaction.id },
        data: { 
          status: 'SUCCESS',
          externalRef: flwData.data.id.toString(), // Store FW ID
          completedAt: new Date()
        }
      });

      return res.status(200).json({
        status: 'SUCCESS',
        amount: updatedTx.amountInKobo,
        verified: true
      });
    } else {
      return res.status(400).json({
        status: 'PENDING',
        message: 'Payment not yet confirmed by gateway'
      });
    }

  } catch (error) {
    console.error('Verification Error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
}
