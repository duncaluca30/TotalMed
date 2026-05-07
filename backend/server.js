require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 1. The New Prisma 7 Adapter imports
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// 2. Initialize the adapter with your Neon URL
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const app = express();

// 3. Give the adapter to the Prisma Client!
const prisma = new PrismaClient({ adapter });

// Middleware
app.use(cors());
app.use(express.json());

// A test route that actually checks the database connection
app.get('/api/status', async (req, res) => {
    try {
        // This asks the database a simple math question to prove it's connected
        await prisma.$queryRaw`SELECT 1 + 1`;
        res.json({ 
            message: "Medical App API is running securely!", 
            database: "Connected successfully to Neon Postgres!" 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database connection failed" });
    }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});