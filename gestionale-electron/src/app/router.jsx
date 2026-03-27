import { createHashRouter } from "react-router-dom";
import AppLayout from "../components/common/AppLayout";
import DashboardPage from "../pages/DashboardPage";
import OrdersPage from "../pages/OrdersPage";
import ProductsPage from "../pages/ProductsPage";
import SettingsPage from "../pages/SettingsPage";

const NotFoundPage = () => <div>Pagina non trovata</div>;

export const appRouter = createHashRouter([
	{
		path: "/",
		element: <AppLayout />,
		children: [
			{ index: true, element: <DashboardPage /> },
			{ path: "orders", element: <OrdersPage /> },
			{ path: "products", element: <ProductsPage /> },
			{ path: "settings", element: <SettingsPage /> },
			{ path: "*", element: <NotFoundPage /> },
		],
	},
]);
