import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Package, Users, Receipt, CreditCard, TrendingUp, AlertTriangle } from "lucide-react";
import ProductManagement from "@/components/ProductManagement";
import FarmerManagement from "@/components/FarmerManagement";
import BillingManagement from "@/components/BillingManagement";
import PaymentManagement from "@/components/PaymentManagement";
import RevenueReport from "@/components/RevenueReport";

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalFarmers: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    lowStockItems: 0,
    overduePayments: 0
  });

  useEffect(() => {
    fetchDashboardStats();
    
    // Set up real-time subscriptions
    const subscriptions = [
      supabase
        .channel('dashboard-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
          fetchDashboardStats();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'farmers' }, () => {
          fetchDashboardStats();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => {
          fetchDashboardStats();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
          fetchDashboardStats();
        })
        .subscribe()
    ];

    return () => {
      subscriptions.forEach(sub => supabase.removeChannel(sub));
    };
  }, []);

  const fetchDashboardStats = async () => {
    try {
      // Get total products
      const { count: productsCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      // Get total farmers
      const { count: farmersCount } = await supabase
        .from('farmers')
        .select('*', { count: 'exact', head: true });

      // Get low stock items
      const { count: lowStockCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .lte('stock_quantity', 'reorder_level');

      // Get total revenue (sum of all paid bills)
      const { data: revenueData } = await supabase
        .from('bills')
        .select('final_amount')
        .eq('payment_status', 'paid');

      const totalRevenue = revenueData?.reduce((sum, bill) => sum + Number(bill.final_amount), 0) || 0;

      // Get pending payments amount
      const { data: pendingData } = await supabase
        .from('customer_accounts')
        .select('current_balance');

      const pendingPayments = pendingData?.reduce((sum, account) => sum + Number(account.current_balance), 0) || 0;

      // Get overdue payments (bills past due date)
      const { count: overdueCount } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .lt('due_date', new Date().toISOString().split('T')[0])
        .neq('payment_status', 'paid');

      setStats({
        totalProducts: productsCount || 0,
        totalFarmers: farmersCount || 0,
        totalRevenue,
        pendingPayments,
        lowStockItems: lowStockCount || 0,
        overduePayments: overdueCount || 0
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">FarmAgro Dashboard</h1>
          <p className="text-muted-foreground">Manage your fertilizer shop efficiently</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Farmers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalFarmers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{stats.totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Amount</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">₹{stats.pendingPayments.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.lowStockItems}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.overduePayments}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="farmers">Farmers</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <ProductManagement />
        </TabsContent>

        <TabsContent value="farmers">
          <FarmerManagement />
        </TabsContent>

        <TabsContent value="billing">
          <BillingManagement />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentManagement />
        </TabsContent>

        <TabsContent value="reports">
          <RevenueReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;