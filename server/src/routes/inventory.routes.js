const router = require('express').Router();
const { protect, checkRole } = require('../middlewares/auth.middleware');
const { getInventory, restock, updateThreshold } = require('../controllers/inventory.controller');
router.use(protect, checkRole('admin', 'vendor'));
router.get('/', getInventory);
router.post('/:id/restock', restock);
router.patch('/:id/threshold', updateThreshold);
module.exports = router;
