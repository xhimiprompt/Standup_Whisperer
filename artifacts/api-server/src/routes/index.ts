import { Router, type IRouter } from "express";
import healthRouter from "./health";
import standupRouter from "./standup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(standupRouter);

export default router;
