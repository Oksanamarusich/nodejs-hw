import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import "dotenv/config";
import gravatar from "gravatar";
import path from "path";
import fs from "fs/promises";
import Jimp from "jimp";

import User, { userSignupSchema, userSigninSchema, userEmailSchema } from "../models/User.js";

import { HttpError, sendEmail } from "../helpers/index.js";

const { JWT_SECRET, BASE_URL } = process.env;

const avatarsPath = path.resolve("public", "avatars");

const signup = async (req, res, next) => {
    try {
        const { error } = userSignupSchema.validate(req.body);
        if (error) {
            throw HttpError(400, error.message);
        }

        const { email, password} = req.body;
        const user = await User.findOne({ email });
        if (user) {
            throw HttpError(409, "Email in use");
        }

        const hashPassword = await bcrypt.hash(password, 10);
        const verificationToken = nanoid();
        const avatarURL = gravatar.url(email);
        const newUser = await User.create({ ...req.body, password: hashPassword, avatarURL, verificationToken});
        const verifyEmail = {
            to: email,
        subject: "Verify email",
        html: `<a target="_blank" href="${BASE_URL}/api/users/verify/${verificationToken}">Click to verify email</a>`
        }

        await sendEmail(verifyEmail);

        res.status(201).json({
            user: ({
                email: newUser.email,
                subscription: newUser.subscription,
               
            })
            
        })
    }
    catch (error) {
        next(error)
    }
};

const signin = async (req, res, next) => {
    try {
        const { error } = userSigninSchema.validate(req.body);
        if (error) {
            throw HttpError(400, error.message);
        }

        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            throw HttpError(401, "Email or password is wrong");
        }

        if (!user.verify) {
            throw HttpError(401, "Email not verify");
        }

        const passwordCompare = await bcrypt.compare(password, user.password);
        if (!passwordCompare) {
            throw HttpError(401, "Email or password is wrong");
        }

        const { _id: contactId } = user;
        const payload = {
            contactId
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "23h" });
        await User.findByIdAndUpdate(contactId, { token });
        
        res.json({
            token,
            user: ({
                email: user.email,
                subscription: user.subscription
            })
             
        })
    }
    catch (error) {
        next(error);
    }
};

const getCurrent = async (req, res) => {
    
    const { email, subscription } = req.user;
    
    res.json({
        email,
        subscription
    });
    
};

const signout = async (req, res) => {
    const { _id } = req.user;
    await User.findByIdAndUpdate(_id, { token: "" });

    res.status(204).json();
};

const updateAvatar = async (req, res, next) => {
    try {
       if (!req.file) {
          throw HttpError(404, "File not found");  
        }
        
        const { _id } = req.user;
        const { path: oldPath, filename } = req.file;
        const resultUpload = path.join(avatarsPath, filename);
        const img = await Jimp.read(oldPath)
        await img.autocrop()
            .cover(250, 250, Jimp.HORIZONTAL_ALIGN_CENTER || Jimp.VERTICAL_ALIGN_MIDDLE)
            .writeAsync(oldPath)
        await fs.rename(oldPath, resultUpload);
        const avatarURL = path.join("avatars", filename);
        await User.findByIdAndUpdate(_id, { avatarURL });

        res.json({
            avatarURL,
        })
    }
    catch (error) {
        next(error)
    }
};
   
const verify = async (req, res) => {
     
    const { verificationToken } = req.params;
    const user = await User.findOne({ verificationToken });
    if (!user) {
        throw HttpError(404, "User not found");
    }
    await User.findByIdAndUpdate(user._id, { verify: true, verificationToken: "" })
    
    res.json({
        message: "Verification successful"
    })
};

const resendVerifyEmail = async (req, res, next) => {
    try {
        const { error } = userEmailSchema.validate(req.body);
        
        if (error) {
            throw HttpError(400, error.message);
        }
        
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            throw HttpError(404, "Email not found");
        }
        if (user.verify) {
            throw HttpError(400, "Verification has already been passed");
        }
        const verifyEmail = {
            to: email,
            subject: "Verify email",
            html: `<a target="_blank" href="${BASE_URL}/api/users/verify/${user.verificationToken}">Click to verify email</a>`
        }
        await sendEmail(verifyEmail);

        res.json({
            message: "Verification email sent"
        })
    }
    catch (error) {
        next(error);
    }
    
};


export default {
    signup,
    signin, 
    getCurrent,
    signout,
    updateAvatar,
    verify,
    resendVerifyEmail
}