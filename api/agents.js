import prisma from '../prisma/client.js';

export default async function handler(req, res) {
  try {
    // GET: List Pending Agents
    if (req.method === 'GET') {
      // In a real app, filter by status. 
      // Since our schema uses isActive as a boolean proxy for "Approved/Active"
      const agents = await prisma.agent.findMany({
        where: { isActive: false },
        orderBy: { createdAt: 'desc' }
      });
      return res.status(200).json(agents);
    }

    // PATCH: Approve Agent
    if (req.method === 'PATCH') {
      const { id, action } = req.body;
      
      if (action === 'approve') {
        const agent = await prisma.agent.update({
          where: { id },
          data: { isActive: true }
        });
        return res.status(200).json(agent);
      }
      
      // If reject, we might delete or mark flagged. 
      // For now, we just delete to "Reject".
      if (action === 'reject') {
        await prisma.agent.delete({ where: { id } });
        return res.status(200).json({ message: 'Agent rejected' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Database error' });
  }
}
