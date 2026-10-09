const router = require('express').Router();
const { protect, checkRole } = require('../middlewares/auth.middleware');
const { getUsers, getUserById, updateUser } = require('../controllers/user.controller');
router.use(protect, checkRole('admin'));
router.get('/', getUsers);
router.get('/:id', getUserById);
router.patch('/:id', updateUser);
module.exports = router;
