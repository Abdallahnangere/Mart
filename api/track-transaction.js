import prisma from '../prisma/client.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Query transactions where metadata.customerPhone equals the provided phone
    // We limit to the last 3 for privacy and speed
    const transactions = await prisma.transaction.findMany({
      where: {
        metadata: {
          path: ['customerPhone'],
          equals: phone
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 3,
      select: {
        reference: true,
        amountInKobo: true,
        status: true,
        createdAt: true,
        type: true,
        metadata: true // Needed to check delivery status inside
      }
    });

    // Format for frontend
    const history = transactions.map(tx => ({
      reference: tx.reference,
      amount: `₦${(tx.amountInKobo / 100).toFixed(2)}`,
      status: tx.status,
      date: tx.createdAt.toISOString(),
      receipt_available: tx.status === 'SUCCESS',
      delivery_status: (tx.metadata && tx.metadata.delivery_status) ? tx.metadata.delivery_status : 'N/A'
    }));

    return res.status(200).json({
      phone,
      history
    });

  } catch (error) {
    console.error('Tracking Error:', error);
    return res.status(500).json({ error: 'Unable to fetch history' });
  }
}
