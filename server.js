require('dotenv').config();
const express = require('express');
const fs = require('fs');

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// insert code after request/setup

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');

  if (password === process.env.ADMIN_PASSWORD) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Invalid credentials');
}

app.use('/admin.html', requireAdminAuth);
app.use('/requests', requireAdminAuth);

// before first app.post



// Create a new cleaning request
app.post('/request', (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync('requests.json', 'utf-8'));

    const {
      propertyAddress,
      propertyType,
      hostName,
      hostWhatsapp,
      checkoutTime,
      nextCheckinTime,
      specialInstructions,
      laundry,
    } = req.body;

    const basePrice = db.rates[propertyType];
    const addOns = [];
    if (laundry) {
      addOns.push({ name: 'Laundry (wash & fold)', price: db.addOnPrices.laundry });
    }
    const totalPrice = basePrice + addOns.reduce((sum, a) => sum + a.price, 0);

    const newRequest = {
      id: db.requests.length + 1,
      propertyAddress,
      propertyType,
      hostName,
      hostWhatsapp,
      checkoutTime,
      nextCheckinTime,
      specialInstructions,
      basePrice,
      addOns,
      totalPrice,
      assignedCleaner: null,
      status: 'requested',
      photoUrl: null,
      createdAt: new Date().toISOString(),
    };

    db.requests.push(newRequest);
    fs.writeFileSync('requests.json', JSON.stringify(db, null, 2));

    res.json({ totalPrice, id: newRequest.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// List all requests (for admin view)
app.get('/requests', (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync('requests.json', 'utf-8'));
    res.json(db.requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Update status or assigned cleaner
app.put('/requests/:id', (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync('requests.json', 'utf-8'));
    const request = db.requests.find(r => r.id === parseInt(req.params.id));

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const { assignedCleaner, status } = req.body;
    if (assignedCleaner !== undefined) request.assignedCleaner = assignedCleaner;
    if (status !== undefined) request.status = status;

    fs.writeFileSync('requests.json', JSON.stringify(db, null, 2));
    res.json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Upload a completion photo for a request
app.post('/requests/:id/photo', upload.single('photo'), (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync('requests.json', 'utf-8'));
    const request = db.requests.find(r => r.id === parseInt(req.params.id));

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    request.photoUrl = '/uploads/' + req.file.filename;
    fs.writeFileSync('requests.json', JSON.stringify(db, null, 2));

    res.json({ photoUrl: request.photoUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.listen(3000, () => console.log('Server running at http://localhost:3000'));