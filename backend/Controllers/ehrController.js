import EHR from '../models/ehrSchema.js'
import Web3 from 'web3';
import {Storage} from '@google-cloud/storage'
import crypto from 'crypto';
// const fs = require('fs');
// const path = require('path');

const projectId = 'medicare-424114'
const keyFilename = 'cloudkey.json'
//const contractPath = path.resolve(__dirname, '../artifacts/contracts/EHRContract.json');
const storage = new Storage({
    projectId,
    keyFilename
});

const bucket = storage.bucket('medicarebucket01') //add bucket name 


// Initialize Web3 and Smart Contract
const web3 = new Web3('http://127.0.0.1:8545')
//const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const contractABI = [
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "filename",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "fileHash",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "owner",
          "type": "string"
        }
      ],
      "name": "addFileRecord",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "fileHash",
          "type": "string"
        }
      ],
      "name": "getFileRecord",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]
const contractAddress = '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0';
const contract = new web3.eth.Contract(contractABI, contractAddress);

// Your Ethereum account (use the address from MetaMask)
const account = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

// Function to generate file hash
const generateFileHash = (fileBuffer) => {

    console.log('inside hash')
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
};

export const uploadFile = async (req,res,next) => {
    console.log('inside ehr controller')
    try{
        console.log('inside ehr controller')
        if(req.file){
            console.log('inside req.file')
            const blob = bucket.file(req.file.originalname)
            const blobStream = blob.createWriteStream();
           
            const downloadURL = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            console.log("Download URL:", downloadURL);

            // Create a new EHR document
            const ehr = new EHR({
                userid: req.userId, // Assuming the user ID is passed in the request body
                filename: req.file.originalname,
                downloadURL: downloadURL,
                description: req.body.description // Assuming description is passed in the request body
            });

            // Save the document to the database
            await ehr.save();



            blobStream.on('finish',()=>{

                console.log("uploaded succesfully")
                res.status(200).json({
                    success : true,
                    message : 'uploaded successfully',
                    data : ehr
                })
            })
            
            blobStream.end(req.file.buffer)
        }else{
            res.status(400).json({success : false , message : 'failed to uplaod', error : 'No file'})
        }

    }catch(e){
        res.status(400).json({success : false , message : 'failed to uplaod', error : e})
    }
} 


export const getAllehr = async (req,res,next)=>{
    const ehrs = await EHR.find()
    res.status(200).json({success : true , message : 'fetched succesfuly',data : ehrs})
}


export const getEHR = async (req,res,next) =>{
    try{
        const ehr = await EHR.find({userid : req.userId})
        res.status(200).json({success:true,message : "fetched succesfully", data : ehr})

    }catch(e){
        res.status(400).json({success:false , message : "Failed to fetch", error : e})
    }
}

export const deleteEHR = async (req, res, next) => {
    try {
        const fileId = req.body.fileid;

        // Find the document in the database
        const ehr = await EHR.findById(fileId);
        if (!ehr) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Extract the filename from the document
        const filename = ehr.filename;

        // Delete the file from the bucket
        const file = bucket.file(filename);
        await file.delete();

        console.log(`Successfully deleted file ${filename} from the bucket`);

        // Delete the document from the database
        await EHR.findByIdAndDelete(fileId);

        // Retrieve remaining documents
        const remainingEHRs = await EHR.find({});

        res.status(200).json({
            success: true,
            message: 'File and corresponding document deleted successfully',
            remainingEHRs: remainingEHRs
        });
    } catch (e) {
        console.error('Error in deleteEHR controller:', e);
        res.status(500).json({
            success: false,
            message: 'Failed to delete file',
            error: e.message
        });
    }
}


export const Blockchain = async (req,res,next)=>{
    try {
        console.log('inside try blockchain block')
        if (req.file) {
            console.log('inside if')
            const blob = bucket.file(req.file.originalname);
            const blobStream = blob.createWriteStream();

            const downloadURL = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            console.log("Download URL:", downloadURL);

            // Generate file hash
            const fileHash = generateFileHash(req.file.buffer);

            // Create a new EHR document
            const ehr = new EHR({
                userid: req.userId, // Assuming the user ID is passed in the request body
                filename: req.file.originalname,
                downloadURL: downloadURL,
                description: req.body.description // Assuming description is passed in the request body
            });

            // Save the document to the database
            
            console.log('here')
            // Interact with the smart contract to store the file hash
            const gas = await contract.methods.addFileRecord(req.file.originalname, fileHash, req.userId).estimateGas({ from: account });
            const result = await contract.methods.addFileRecord(req.file.originalname, fileHash, req.userId).send({ from: account, gas });

            console.log("Transaction result:", result);

            blobStream.on('finish', async () => {
                console.log("uploaded successfully");
                await ehr.save();
                res.status(200).json({
                    success: true,
                    message: 'uploaded successfully',
                    data: ehr
                });
            });

            blobStream.end(req.file.buffer);
        } else {
            console.log('inside no file')
            res.status(400).json({ success: false, message: 'failed to upload', error: 'No file' });
        }
    } catch (e) {
        res.status(400).json({ success: false, message: 'failed to upload', error: e });
    }
}


export const getBlockchainEHR = async (req, res, next) => {
    try {
        const ehrs = await EHR.find({ userid: req.userId });
        
        // Verify each EHR with blockchain
        for (const ehr of ehrs) {
            const response = await axios.get(ehr.downloadURL, { responseType: 'arraybuffer' });
            const fileBuffer = Buffer.from(response.data, 'binary');
            const fileHash = generateFileHash(fileBuffer);
            const result = await contract.methods.getFileRecord(fileHash).call();

            const [retrievedFilename, retrievedOwner, retrievedTimestamp] = result;

            if (retrievedOwner !== req.userId) {
                return res.status(400).json({
                    success: false,
                    message: "File integrity check failed",
                });
            }
        }
        res.status(200).json({ success: true, message: "fetched successfully", data: ehrs });
    } catch (e) {
        res.status(400).json({ success: false, message: "Failed to fetch", error: e });
    }
};
