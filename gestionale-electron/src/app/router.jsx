import { Navigate, createHashRouter } from "react-router-dom";
import AppLayout from "../components/common/AppLayout";
import CustomersPage from "../pages/CustomersPage";
import DashboardPage from "../pages/DashboardPage";
import OrdersPage from "../pages/OrdersPage";
import ProductsPage from "../pages/ProductsPage";
import StatisticsPage from "../pages/StatisticsPage";
import SettingsPage from "../pages/SettingsPage";
import SettingsCategoriesPage from "../pages/settings/SettingsCategoriesPage";
import SettingsCashClosurePage from "../pages/settings/SettingsCashClosurePage";
import SettingsPrintPage from "../pages/settings/SettingsPrintPage";
import SettingsSchedulePage from "../pages/settings/SettingsSchedulePage";

const NotFoundPage = () => <div>Pagina non trovata</div>;

export const appRouter = createHashRouter([
	{
		path: "/",
		element: <AppLayout />,
		children: [
			{ index: true, element: <DashboardPage /> },
			{ path: "orders", element: <OrdersPage /> },
			{ path: "statistics", element: <StatisticsPage /> },
			{ path: "customers", element: <CustomersPage /> },
			{ path: "products", element: <ProductsPage /> },
			{
				path: "settings",
				element: <SettingsPage />,
				children: [
					{ index: true, element: <Navigate to="orari" replace /> },
					{ path: "orari", element: <SettingsSchedulePage /> },
					{ path: "categorie", element: <SettingsCategoriesPage /> },
					{ path: "stampa", element: <SettingsPrintPage /> },
					{ path: "cassa", element: <SettingsCashClosurePage /> },
				],
			},
			{ path: "*", element: <NotFoundPage /> },
		],
	},
]);
