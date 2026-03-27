import { Router } from "express";
import {
	pullOrderMutations,
	pushOrderMutations,
} from "../modules/orders/orders.service";

const ordersRouter = Router();

ordersRouter.post("/sync/up", async (req, res, next) => {
	try {
		const result = await pushOrderMutations(req.body);
		res.json(result);
	} catch (error) {
		next(error);
	}
});

ordersRouter.get("/sync/down", async (req, res, next) => {
	try {
		const since = typeof req.query.since === "string" ? req.query.since : undefined;
		const result = await pullOrderMutations({ since });
		res.json(result);
	} catch (error) {
		next(error);
	}
});

export { ordersRouter };
