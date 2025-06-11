const express = require('express');
const router = express.Router();
const {
    getTransactionDetails,
    getNFTsByAddress,
    calculateStakingStats
} = require('../utils/web3Utils');

// Get complete staking stats for an address
router.get('/stats/:address', async (req, res) => {
    try {
        const stats = await calculateStakingStats(req.params.address);
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all NFTs owned by an address with their tiers and multipliers
router.get('/nfts/:address', async (req, res) => {
    try {
        const nfts = await getNFTsByAddress(req.params.address);
        res.json({ success: true, data: nfts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get detailed transaction history for an address
router.get('/history/:address', async (req, res) => {
    try {
        const transactions = await getTransactionDetails(req.params.address);
        res.json({ success: true, data: transactions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router; 