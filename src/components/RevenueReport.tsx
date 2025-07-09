import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Calendar, DollarSign, Package, Users } from "lucide-react";

interface RevenueData {
  totalRevenue: number;
  totalBills: number;
  totalProducts: number;
  totalFarmers: number;
  monthlyRevenue: { month: string; revenue: number; }[];
  topProducts: { product_name: string; total_sold: number; revenue: number; }[];
  topFarmers: { farmer_name: string; total_purchases: number; }[];
}

const RevenueReport = () => {
  const [revenueData, setRevenueData] = useState<RevenueData>({
    totalRevenue: 0,
    totalBills: 0,
    totalProducts: 0,
    totalFarmers: 0,
    monthlyRevenue: [],
    topProducts: [],
    topFarmers: []
  });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reportType, setReportType] = useState("all");

  useEffect(() => {
    fetchRevenueData();
  }, []);

  const fetchRevenueData = async () => {
    try {
      let query = supabase.from('bills').select(`
        *,
        farmer:farmers(name),
        bill_items(*, product:products(name))
      `);

      // Apply date filters if provided
      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59');
      }

      // Apply payment status filter
      if (reportType === 'paid') {
        query = query.eq('payment_status', 'paid');
      } else if (reportType === 'pending') {
        query = query.in('payment_status', ['pending', 'partial']);
      }

      const { data: bills, error: billsError } = await query.order('created_at', { ascending: false });
      
      if (billsError) throw billsError;

      // Calculate total revenue
      const totalRevenue = bills
        ?.filter(bill => bill.payment_status === 'paid')
        .reduce((sum, bill) => sum + Number(bill.final_amount), 0) || 0;

      // Get total counts
      const { count: totalBills } = await supabase
        .from('bills')
        .select('*', { count: 'exact', head: true });

      const { count: totalProducts } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      const { count: totalFarmers } = await supabase
        .from('farmers')
        .select('*', { count: 'exact', head: true });

      // Calculate monthly revenue
      const monthlyRevenue = bills
        ?.filter(bill => bill.payment_status === 'paid')
        .reduce((acc: any, bill) => {
          const month = new Date(bill.created_at).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short' 
          });
          acc[month] = (acc[month] || 0) + Number(bill.final_amount);
          return acc;
        }, {});

      const monthlyRevenueArray = Object.entries(monthlyRevenue || {}).map(([month, revenue]) => ({
        month,
        revenue: revenue as number
      }));

      // Calculate top products
      const productSales: { [key: string]: { total_sold: number; revenue: number; } } = {};
      
      bills?.forEach(bill => {
        if (bill.payment_status === 'paid') {
          bill.bill_items?.forEach(item => {
            const productName = item.product?.name || 'Unknown';
            if (!productSales[productName]) {
              productSales[productName] = { total_sold: 0, revenue: 0 };
            }
            productSales[productName].total_sold += Number(item.quantity);
            productSales[productName].revenue += Number(item.total_price);
          });
        }
      });

      const topProducts = Object.entries(productSales)
        .map(([product_name, data]) => ({ product_name, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Calculate top farmers
      const farmerPurchases: { [key: string]: number } = {};
      
      bills?.forEach(bill => {
        const farmerName = bill.farmer?.name || 'Unknown';
        farmerPurchases[farmerName] = (farmerPurchases[farmerName] || 0) + 1;
      });

      const topFarmers = Object.entries(farmerPurchases)
        .map(([farmer_name, total_purchases]) => ({ farmer_name, total_purchases }))
        .sort((a, b) => b.total_purchases - a.total_purchases)
        .slice(0, 10);

      setRevenueData({
        totalRevenue,
        totalBills: totalBills || 0,
        totalProducts: totalProducts || 0,
        totalFarmers: totalFarmers || 0,
        monthlyRevenue: monthlyRevenueArray,
        topProducts,
        topFarmers
      });

    } catch (error) {
      console.error('Error fetching revenue data:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="reportType">Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bills</SelectItem>
                  <SelectItem value="paid">Paid Only</SelectItem>
                  <SelectItem value="pending">Pending Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={fetchRevenueData} className="w-full">
                Generate Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₹{revenueData.totalRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bills</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revenueData.totalBills}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revenueData.totalProducts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Farmers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revenueData.totalFarmers}</div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Monthly Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenueData.monthlyRevenue.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.month}</TableCell>
                      <TableCell className="font-bold text-green-600">₹{item.revenue.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Top Selling Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity Sold</TableHead>
                    <TableHead>Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenueData.topProducts.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell>{item.total_sold}</TableCell>
                      <TableCell className="font-bold text-green-600">₹{item.revenue.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Farmers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Top Customers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Farmer Name</TableHead>
                  <TableHead>Total Purchases</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueData.topFarmers.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.farmer_name}</TableCell>
                    <TableCell>{item.total_purchases}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RevenueReport;