import { Routes, Route } from 'react-router-dom';
import { AdminLayout } from './layouts/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsListPage } from './pages/products/ProductsListPage';
import { ProductFormPage } from './pages/products/ProductFormPage';
import { AiImageStudioPage } from './pages/products/AiImageStudioPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { OrdersListPage } from './pages/orders/OrdersListPage';
import { OrderDetailPage } from './pages/orders/OrderDetailPage';
import { CustomersListPage } from './pages/customers/CustomersListPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { HomepagePage } from './pages/HomepagePage';
import { ReviewsListPage } from './pages/reviews/ReviewsListPage';
import { CouponsListPage } from './pages/coupons/CouponsListPage';
import { PricingPage } from './pages/PricingPage';
import { AdminUsersListPage } from './pages/adminUsers/AdminUsersListPage';
import { AuditLogsPage } from './pages/AuditLogsPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsListPage />} />
        <Route path="/products/new" element={<ProductFormPage />} />
        <Route path="/products/:id/edit" element={<ProductFormPage />} />
        <Route path="/products/:id/ai-image-studio" element={<AiImageStudioPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/homepage" element={<HomepagePage />} />
        <Route path="/orders" element={<OrdersListPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/customers" element={<CustomersListPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/reviews" element={<ReviewsListPage />} />
        <Route path="/coupons" element={<CouponsListPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/admin-users" element={<AdminUsersListPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
      </Route>
    </Routes>
  );
}
