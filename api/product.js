import prisma from '../prisma/client.js';

export default async function handler(req, res) {
  try {
    // GET: List all products
    if (req.method === 'GET') {
      const products = await prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        where: { isActive: true }
      });
      return res.status(200).json(products);
    }

    // POST: Add new product
    if (req.method === 'POST') {
      const { name, priceInKobo, description } = req.body;
      const product = await prisma.product.create({
        data: {
          name,
          priceInKobo: parseInt(priceInKobo),
          description,
          stock: 100 // Default stock
        }
      });
      return res.status(200).json(product);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database error' });
  }
}
