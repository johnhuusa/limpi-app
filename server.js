require('dotenv').config();
const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/request', (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync('requests.json', 'utf-8'));

    const { propertyAddress, propertyType, hostName, hostWhatsapp, checkoutTime, nextCheckinTime, specialInstructions, laundry } = req.body;

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

app.listen(3000, () => console.log('Server running at http://localhost:3000'));
