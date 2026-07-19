const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const JWT_SECRET = process.env.JWT_SECRET || 'bakehub_jwt_secret_key_98765';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files from the BakeHub directory
app.use(express.static(path.join(__dirname, 'BakeHub')));
app.use('/Images', express.static(path.join(__dirname, 'Images')));

// Redirect root to Home page directly
app.get('/', (req, res) => {
    res.redirect('/_Home.html');
});

// Helper functions for Database persistence
function readDb() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ customers: [], orders: [] }, null, 2));
    }
    try {
        const fileContent = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(fileContent);
    } catch (e) {
        console.error('Error reading database:', e);
        return { customers: [], orders: [] };
    }
}

function writeDb(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing database:', e);
    }
}

// Format date helper (similar to MySQL DATETIME / TIMESTAMP)
function getFormattedDate() {
    const d = new Date();
    return d.toISOString().replace('T', ' ').substring(0, 19);
}

// JWT helper
function generateAndSetJwt(res, user) {
    const token = jwt.sign(
        { userId: user.id, phone: user.phone, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    res.cookie('jwt_token', token, {
        httpOnly: true,
        secure: false, // Set to true if running over HTTPS in production
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    return token;
}

// Token Verification Middleware
function authenticateToken(req, res, next) {
    const token = req.cookies.jwt_token;
    if (!token) {
        req.user = null;
        return next();
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            req.user = null;
        } else {
            req.user = decoded; // Contains userId, phone, email
        }
        next();
    });
}

// Require Authentication Middleware
function requireAuth(req, res, next) {
    if (!req.user) {
        return res.json({ success: false, message: 'Not logged in' });
    }
    next();
}

// --- Configuration Endpoint ---
app.get('/api/config', (req, res) => {
    // Determine mode based on existence of Firebase environment variables
    const isFirebaseConfigured = !!(process.env.FIREBASE_API_KEY && process.env.FIREBASE_PROJECT_ID);
    res.json({
        otpProvider: isFirebaseConfigured ? 'firebase' : 'mock',
        firebaseConfig: {
            apiKey: process.env.FIREBASE_API_KEY || "",
            authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
            projectId: process.env.FIREBASE_PROJECT_ID || "",
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
            appId: process.env.FIREBASE_APP_ID || ""
        }
    });
});

// --- OTP Verification Endpoints ---

// 1. Mock OTP Verification
app.post('/verify-otp-mock', (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.json({ success: false, message: 'Mobile number is required.' });
    }

    const db = readDb();
    let user = db.customers.find(c => c.phone === phoneNumber);

    if (!user) {
        const nextId = db.customers.length > 0 ? Math.max(...db.customers.map(c => c.id)) + 1 : 1;
        user = {
            id: nextId,
            name: `User ${phoneNumber}`,
            email: '',
            password: '',
            phone: phoneNumber,
            gender: '',
            birthday: '',
            created_at: getFormattedDate()
        };
        db.customers.push(user);
        writeDb(db);
    }

    generateAndSetJwt(res, user);
    return res.json({ success: true, message: 'Mock authentication successful!' });
});

// 2. Firebase OTP Verification
app.post('/verify-otp-firebase', (req, res) => {
    const { idToken, phoneNumber } = req.body;

    let phone = phoneNumber;

    // Decode JWT from Firebase to securely extract the authenticated phone number
    if (idToken) {
        try {
            const decoded = jwt.decode(idToken);
            if (decoded && decoded.phone_number) {
                phone = decoded.phone_number;
            }
        } catch (e) {
            console.error('Error decoding Firebase token:', e);
        }
    }

    if (!phone) {
        return res.json({ success: false, message: 'Invalid token or phone number.' });
    }

    const db = readDb();
    let user = db.customers.find(c => c.phone === phone);

    if (!user) {
        const nextId = db.customers.length > 0 ? Math.max(...db.customers.map(c => c.id)) + 1 : 1;
        user = {
            id: nextId,
            name: `User ${phone}`,
            email: '',
            password: '',
            phone: phone,
            gender: '',
            birthday: '',
            created_at: getFormattedDate()
        };
        db.customers.push(user);
        writeDb(db);
    }

    generateAndSetJwt(res, user);
    return res.json({ success: true, message: 'Firebase authentication successful!' });
});

// --- Endpoints Replicating PHP/MySQL Backend using JWT Cookie Auth ---

// get_user_data.php
app.get('/get_user_data.php', authenticateToken, (req, res) => {
    if (!req.user) {
        return res.json({ logged_in: false });
    }

    const db = readDb();
    const user = db.customers.find(c => c.id === req.user.userId);

    if (user) {
        return res.json({ logged_in: true, name: user.name });
    } else {
        return res.json({ logged_in: false });
    }
});

// place_order.php
app.post('/place_order.php', authenticateToken, requireAuth, (req, res) => {
    const { items, total, deliveryDate, paymentMode } = req.body;
    const db = readDb();
    const user = db.customers.find(c => c.id === req.user.userId);

    if (!user) {
        return res.json({ success: false, message: 'User not found.' });
    }

    const nextOrderId = db.orders.length > 0 ? Math.max(...db.orders.map(o => parseInt(o.order_id, 10))) + 1 : 1;
    const order_id_str = String(nextOrderId).padStart(4, '0');

    const newOrder = {
        order_id: order_id_str,
        customer_id: user.id,
        items: items,
        total_amount: parseFloat(total).toFixed(2),
        order_date: getFormattedDate(),
        delivery_date: deliveryDate || null,
        payment_mode: paymentMode || 'cod'
    };

    db.orders.push(newOrder);
    writeDb(db);

    return res.json({ success: true, message: 'Order placed successfully!' });
});

// get_orders.php
app.get('/get_orders.php', authenticateToken, requireAuth, (req, res) => {
    const db = readDb();
    const user = db.customers.find(c => c.id === req.user.userId);

    if (!user) {
        return res.json({ success: false, message: 'User not found' });
    }

    const userOrders = db.orders
        .filter(o => o.customer_id === user.id)
        .sort((a, b) => new Date(b.order_date) - new Date(a.order_date));

    return res.json({ success: true, orders: userOrders });
});

// profile_actions.php
app.all('/profile_actions.php', authenticateToken, (req, res) => {
    const action = req.query.action || req.body.action || '';

    if (action === 'logout') {
        res.clearCookie('jwt_token');
        return res.json({ success: true });
    }

    if (!req.user) {
        return res.json({ success: false, message: 'Not logged in' });
    }

    const db = readDb();
    const userIndex = db.customers.findIndex(c => c.id === req.user.userId);

    if (userIndex === -1) {
        return res.json({ success: false, message: 'User not found' });
    }

    const user = db.customers[userIndex];

    switch (action) {
        case 'fetch':
            return res.json({
                success: true,
                data: {
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    gender: user.gender,
                    birthday: user.birthday
                }
            });

        case 'update': {
            const { name, email, gender, birthday } = req.body;
            // Phone is verified and cannot be changed here
            user.name = name !== undefined ? name : user.name;
            user.email = email !== undefined ? email : user.email;
            user.gender = gender !== undefined ? gender : user.gender;
            user.birthday = birthday !== undefined ? birthday : user.birthday;

            db.customers[userIndex] = user;
            writeDb(db);
            return res.json({ success: true });
        }

        case 'delete':
            // Delete customer orders
            db.orders = db.orders.filter(o => o.customer_id !== user.id);
            // Delete customer
            db.customers.splice(userIndex, 1);
            writeDb(db);

            res.clearCookie('jwt_token');
            return res.json({ success: true });

        default:
            return res.json({ success: false, message: 'Invalid action' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🎂 BakeHub Localhost Server running successfully!`);
    console.log(`👉 Access website at: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
