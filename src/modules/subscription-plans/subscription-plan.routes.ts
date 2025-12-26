import { Router } from "express";
import { getAllPlans } from "./subscription-plan.controller";

const router = Router();

//Get all plan user
router.get("/", getAllPlans);

export default router;