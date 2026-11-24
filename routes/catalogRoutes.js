import { Router } from "express";
import { getCatalog } from "../controllers/catalogController.js";

export const catalogRoutes = Router();

catalogRoutes.get("/", getCatalog);
