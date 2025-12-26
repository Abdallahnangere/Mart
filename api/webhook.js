import prisma from '../prisma/client.js';

export default async function handler(req, res) {
  // 1. Handle Webhook Verification (Flutterwave sends a handshake sometimes)
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'active' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Verify Signature
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  const signature = req.headers['verif-hash'];

  if (!signature || signature !== secretHash) {
    // Fail silently to the caller, but log it
    console.error('Invalid Webhook Signature');
    return res.status(401).end();
  }

  const payload = req.body;

  try {
    // 3. Handle Successful Payment Event
    if (payload.status === 'successful' && payload.txRef) {
      
      // Find the transaction by reference
      const transaction = await prisma.transaction.findUnique({
        where: { reference: payload.txRef }
      });

      if (transaction && transaction.status !== 'SUCCESS') {
        // Update to SUCCESS
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { 
            status: 'SUCCESS',
            externalRef: payload.id.toString(),
            completedAt: new Date()
          }
        });
        
        console.log(`Webhook: Transaction ${payload.txRef} updated to SUCCESS`);
      }
    }

    // Always return 200 OK to Flutterwave so they stop sending the event
    return res.status(200).end();

  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).end();
  }
}
