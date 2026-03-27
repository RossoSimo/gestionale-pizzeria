import express from "express";
import { ordersRouter } from "./routes/orders.routes";
import { productsRouter } from "./routes/products.routes";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(express.json());

app.get("/health", (_req, res) => {
	res.json({
		ok: true,
		service: "gestionale-api",
		ts: new Date().toISOString(),
	});
});

app.use("/orders", ordersRouter);
app.use("/products", productsRouter);

if (process.env.NODE_ENV !== "test") {
	app.listen(port, () => {
		// eslint-disable-next-line no-console
		console.log(`API listening on port ${port}`);
	});
}

export { app };
