import { Router } from "express";
import {
	pullProductMutations,
	pushProductMutations,
} from "../modules/products/products.service";

const productsRouter = Router();

productsRouter.post("/sync/up", async (req, res, next) => {
	try {
		const result = await pushProductMutations(req.body);
		res.json(result);
	} catch (error) {
		next(error);
	}
});

productsRouter.get("/sync/down", async (req, res, next) => {
	try {
		const since = typeof req.query.since === "string" ? req.query.since : undefined;
		const result = await pullProductMutations({ since });
		res.json(result);
	} catch (error) {
		next(error);
	}
});

export { productsRouter };
