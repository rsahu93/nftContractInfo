const { ethers } = require('ethers');
const axios = require('axios');
const { stakingContractABI, nftContractABI } = require('../config/contractABI');
require('dotenv').config();

// Initialize provider
const provider = new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC);

// Initialize contracts
const stakingContract = new ethers.Contract(
    process.env.STAKING_CONTRACT_ADDRESS,
    stakingContractABI,
    provider
);

const nftContract = new ethers.Contract(
    process.env.NFT_CONTRACT_ADDRESS,
    nftContractABI,
    provider
);

const METHOD_IDS = {
    STAKE: '0xa422b640',
    UNSTAKE: '0x52b23c3d',
    RENT: '0x9e9c4f3e'
};

const getMultiplierForTier = (tier) => {
    switch (parseInt(tier)) {
        case 1:
            return 4;
        case 2:
            return 5;
        case 3:
            return 6;
        default:
            return 3;
    }
};

const decodeTransactionInput = (input, methodId) => {
    const tokenIdHex = input.slice(10); // Remove method ID and '0x'
    return parseInt(tokenIdHex, 16);
};

const getTransactionDetails = async (address) => {
    const apiKey = process.env.BSCSCAN_API_KEY;
    const url = `https://api-testnet.bscscan.com/api`;
    
    const response = await axios.get(url, {
        params: {
            module: 'account',
            action: 'txlist',
            address: process.env.STAKING_CONTRACT_ADDRESS,
            apikey: apiKey,
            sort: 'asc'
        }
    });

    const transactions = response.data.result.filter(tx => 
        tx.from.toLowerCase() === address.toLowerCase() && tx.isError === '0'
    );

    const nftStatus = new Map();

    transactions.forEach(tx => {
        const methodId = tx.input.slice(0, 10);
        const tokenId = decodeTransactionInput(tx.input, methodId);
        const timestamp = parseInt(tx.timeStamp) * 1000; // Convert to milliseconds

        if (!nftStatus.has(tokenId)) {
            nftStatus.set(tokenId, {
                tokenId,
                status: 'unstaked',
                stakeHistory: [],
                rentHistory: [],
                currentStakeTime: null,
                currentRentTime: null,
                lastAction: null
            });
        }

        const nft = nftStatus.get(tokenId);

        switch (methodId) {
            case METHOD_IDS.STAKE:
                nft.status = 'staked';
                nft.currentStakeTime = timestamp;
                nft.stakeHistory.push({
                    action: 'stake',
                    timestamp,
                    transactionHash: tx.hash
                });
                nft.lastAction = 'stake';
                break;

            case METHOD_IDS.UNSTAKE:
                nft.status = 'unstaked';
                if (nft.currentStakeTime) {
                    nft.stakeHistory.push({
                        action: 'unstake',
                        timestamp,
                        duration: timestamp - nft.currentStakeTime,
                        transactionHash: tx.hash
                    });
                }
                nft.currentStakeTime = null;
                nft.lastAction = 'unstake';
                break;

            case METHOD_IDS.RENT:
                nft.status = 'rented';
                nft.currentRentTime = timestamp;
                nft.rentHistory.push({
                    action: 'rent',
                    timestamp,
                    transactionHash: tx.hash
                });
                nft.lastAction = 'rent';
                break;
        }
    });

    return Array.from(nftStatus.values());
};

const getNFTsByAddress = async (address) => {
    const balance = await nftContract.balanceOf(address);
    const nfts = [];
    
    for (let i = 0; i < balance; i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(address, i);
        const tier = await nftContract.getTier(tokenId);
        nfts.push({
            tokenId: tokenId.toString(),
            tier: tier.toString(),
            multiplier: getMultiplierForTier(tier)
        });
    }
    
    return nfts;
};

const calculateStakingStats = async (address) => {
    const [nfts, transactionDetails] = await Promise.all([
        getNFTsByAddress(address),
        getTransactionDetails(address)
    ]);

    const nftMap = new Map(nfts.map(nft => [nft.tokenId, nft]));
    
    const enrichedDetails = transactionDetails.map(detail => {
        const nft = nftMap.get(detail.tokenId.toString());
        if (nft) {
            return {
                ...detail,
                tier: nft.tier,
                multiplier: nft.multiplier,
                currentRewards: detail.status === 'staked' && detail.currentStakeTime ? 
                    calculateRewards(
                        Date.now() - detail.currentStakeTime,
                        nft.multiplier
                    ) : 0
            };
        }
        return detail;
    });

    return {
        totalNFTs: nfts.length,
        stakedNFTs: enrichedDetails.filter(d => d.status === 'staked').length,
        rentedNFTs: enrichedDetails.filter(d => d.status === 'rented').length,
        nftDetails: enrichedDetails
    };
};

const calculateRewards = (stakingDuration, multiplier) => {
    // Convert duration to days
    const daysStaked = stakingDuration / (1000 * 60 * 60 * 24);
    // Basic reward calculation (this is an example - adjust according to your actual reward logic)
    return daysStaked * multiplier;
};

// Function to create a signer for transactions
const getSigner = (privateKey) => {
    return new ethers.Wallet(privateKey, provider);
};

// Transaction functions
const stakePass = async (signer, tokenId) => {
    const contract = stakingContract.connect(signer);
    const tx = await contract.stakePass(tokenId);
    return await tx.wait();
};

const unstakePass = async (signer, tokenId) => {
    const contract = stakingContract.connect(signer);
    const tx = await contract.unstakePass(tokenId);
    return await tx.wait();
};

const rentPass = async (signer, tokenId) => {
    const contract = stakingContract.connect(signer);
    const tx = await contract.rentPass(tokenId);
    return await tx.wait();
};

module.exports = {
    provider,
    stakingContract,
    nftContract,
    getMultiplierForTier,
    getTransactionDetails,
    getNFTsByAddress,
    calculateStakingStats,
    getSigner,
    stakePass,
    unstakePass,
    rentPass
}; 