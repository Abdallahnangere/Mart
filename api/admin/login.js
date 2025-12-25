import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  // Check against Environment Variables
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminHash = process.env.ADMIN_PASSWORD_HASH;

  if (!adminEmail || !adminHash) {
    return res.status(500).json({ error: 'Server misconfiguration: Admin credentials not set' });
  }

  if (email !== adminEmail) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, adminHash);

  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // In a real app, sign a JWT here. 
  // For this serverless setup, we return a simple session token.
  return res.status(200).json({ 
    token: uuidv4(),
    message: 'Authenticated successfully' 
  });
}
