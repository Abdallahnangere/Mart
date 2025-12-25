import prisma from '../prisma/client.js';

export default async function handler(req, res) {
  try {
    // GET: List all plans
    if (req.method === 'GET') {
      const plans = await prisma.dataPlan.findMany({
        orderBy: { network: 'asc' },
        where: { isActive: true }
      });
      return res.status(200).json(plans);
    }

    // POST: Add new plan
    if (req.method === 'POST') {
      const { network, planName, apiPlanId, priceInKobo } = req.body;
      
      const plan = await prisma.dataPlan.create({
        data: {
          network, // Must be 'MTN', 'GLO', etc. based on Schema Enum
          planName,
          apiPlanId,
          priceInKobo: parseInt(priceInKobo),
          sellingPrice: parseInt(priceInKobo) // Simple markup logic
        }
      });
      return res.status(200).json(plan);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database error' });
  }
}
