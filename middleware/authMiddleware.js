const jwt = require('jsonwebtoken');

// ================= AUTH MIDDLEWARE =================
// Verifies if the user is logged in
const authMiddleware = (req, res, next) => {
    try {
        // 1️⃣ Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'No token provided, authorization denied' });
        }

        // 2️⃣ Extract token
        const token = authHeader.split(' ')[1];

        // 3️⃣ Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 4️⃣ Attach user to request
        req.user = decoded;

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired, please login again' });
        }
        return res.status(401).json({ message: 'Invalid token, authorization denied' });
    }
};

// ================= ROLE MIDDLEWARE =================
// Restricts access based on role
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: `Access denied. Only ${roles.join(', ')} can access this route.` 
            });
        }
        next();
    };
};

module.exports = { authMiddleware, authorizeRoles };