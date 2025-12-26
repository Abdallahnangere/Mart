import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminEmail || !adminHash) {
        console.error("Admin credentials missing in .env");
        return res.status(500).json({ error: 'Server Config Error: Credentials missing' });
    }

    // 1. Check Email
    if (email !== adminEmail) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // 2. Check Password (Async)
    const match = await bcrypt.compare(password, adminHash);

    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // 3. Success
    return res.status(200).json({ 
      token: uuidv4(),
      message: 'Authenticated successfully' 
    });

  } catch (error) {
    console.error("Login API Error:", error);
    return res.status(500).json({ error: 'Internal Login Error' });
  }
}
