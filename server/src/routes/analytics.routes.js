const router = require('express').Router();
const { protect, checkRole } = require('../middlewares/auth.middleware');
const { getAnalytics } = require('../controllers/analytics.controller');
router.get('/', protect, checkRole('admin', 'vendor'), getAnalytics);
module.exports = router;
