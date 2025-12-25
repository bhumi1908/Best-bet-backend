import { Router } from "express";
import { getAllPlans } from "./subscription-plan.controller";

const router = Router();

router.get("/", getAllPlans);

export default router;