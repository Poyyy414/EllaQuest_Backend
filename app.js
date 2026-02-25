const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
// const curriculumManagerRoutes = require('./routes/curriculumManagerRoutes');
// const instructorRoutes = require('./routes/instructorRoutes');
// const studentRoutes = require('./routes/studentRoutes');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('Welcome to the Ella Quest API!');
});

app.use('/', userRoutes);
app.use('/admin', adminRoutes);
// app.use('/curriculum-manager', curriculumManagerRoutes);
// app.use('/instructor', instructorRoutes);
// app.use('/student', studentRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => { 
    console.log(`Server is running on port ${PORT}`);
});