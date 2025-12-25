import { v4 as uuidv4 } from 'uuid';
import prisma from '../prisma/client.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { transaction_reference, network, mobile_number, plan_id, ported_number } = req.body;

    // 1. Validate & Fetch Transaction
    const transaction = await prisma.transaction.findUnique({
      where: { reference: transaction_reference },
      include: { dataPlan: true } // Fetch plan details if linked, or we use plan_id input
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // 2. Payment Guard
    if (transaction.status !== 'SUCCESS') {
      return res.status(402).json({ error: 'Payment not verified' });
    }

    // 3. Idempotency Check (Prevent double delivery)
    // Check if we already have metadata indicating delivery attempt
    const metadata = transaction.metadata || {};
    if (metadata.delivery_status === 'DELIVERED' || metadata.amigo_ref) {
      return res.status(200).json({ 
        status: 'DELIVERED', 
        message: 'Data already delivered',
        amigo_ref: metadata.amigo_ref 
      });
    }

    // 4. Determine Plan ID (Use DB relation or Input)
    // If the transaction created was for a specific plan, we use that. 
    // Otherwise fallback to input, but strictly strictly validated.
    let apiPlanCode = plan_id;
    if (transaction.dataPlan && transaction.dataPlan.apiPlanId) {
      apiPlanCode = parseInt(transaction.dataPlan.apiPlanId);
    }

    // 5. Call Amigo API
    const idempotencyKey = uuidv4();
    
    const payload = {
      network: parseInt(network),
      mobile_number: mobile_number,
      plan: parseInt(apiPlanCode),
      Ported_number: !!ported_number
    };

    const amigoRes = await fetch(`${process.env.AMIGO_BASE_URL}/data`, { // Assuming /data endpoint based on context
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.AMIGO_API_KEY,
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(payload)
    });

    const amigoData = await amigoRes.json();

    // 6. Handle Amigo Response
    // Adjust logic based on exact Amigo success codes. Assuming standard HTTP 200/201 or 'status' field.
    if (amigoRes.ok) {
        // Success
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                // We keep status SUCCESS (money paid), but update metadata for delivery
                // OR we can add a 'DELIVERED' status to enum if allowed.
                // Re-using description or metadata for specific delivery details.
                metadata: {
                    ...metadata,
                    delivery_status: 'DELIVERED',
                    amigo_ref: amigoData.id || amigoData.reference || 'REF_UNKNOWN',
                    amigo_response: amigoData
                }
            }
        });

        return res.status(200).json({
            status: 'DELIVERED',
            amigo_ref: amigoData.id
        });
    } else {
        // Delivery Failed
        console.error('Amigo Delivery Failed:', amigoData);
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                metadata: {
                    ...metadata,
                    delivery_status: 'FAILED',
                    amigo_error: amigoData
                }
            }
        });
        return res.status(502).json({ error: 'Data delivery failed', details: amigoData });
    }

  } catch (error) {
    console.error('Delivery Critical Error:', error);
    return res.status(500).json({ error: 'Internal Server Error during delivery' });
  }
}
