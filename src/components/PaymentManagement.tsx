import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Payment, Bill, Farmer, CustomerAccount } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, CreditCard, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PaymentManagement = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customerAccounts, setCustomerAccounts] = useState<CustomerAccount[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [pendingBills, setPendingBills] = useState<Bill[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFarmerId, setSelectedFarmerId] = useState("");
  const [selectedBillId, setSelectedBillId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchPayments();
    fetchCustomerAccounts();
    fetchFarmers();
    fetchPendingBills();
    
    // Real-time subscription
    const subscription = supabase
      .channel('payments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        fetchPayments();
        fetchCustomerAccounts();
        fetchPendingBills();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          farmer:farmers(*),
          bill:bills(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast({
        title: "Error",
        description: "Failed to fetch payments",
        variant: "destructive"
      });
    }
  };

  const fetchCustomerAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('customer_accounts')
        .select(`
          *,
          farmer:farmers(*)
        `)
        .order('current_balance', { ascending: false });

      if (error) throw error;
      setCustomerAccounts(data || []);
    } catch (error) {
      console.error('Error fetching customer accounts:', error);
    }
  };

  const fetchFarmers = async () => {
    try {
      const { data, error } = await supabase
        .from('farmers')
        .select('*')
        .order('name');

      if (error) throw error;
      setFarmers(data || []);
    } catch (error) {
      console.error('Error fetching farmers:', error);
    }
  };

  const fetchPendingBills = async () => {
    try {
      const { data, error } = await supabase
        .from('bills')
        .select(`
          *,
          farmer:farmers(*)
        `)
        .in('payment_status', ['pending', 'partial'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingBills(data || []);
    } catch (error) {
      console.error('Error fetching pending bills:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFarmerId || !paymentAmount) {
      toast({
        title: "Error",
        description: "Please select a farmer and enter payment amount",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('payments')
        .insert([{
          farmer_id: selectedFarmerId,
          bill_id: selectedBillId || null,
          amount_paid: parseFloat(paymentAmount),
          payment_method: paymentMethod,
          notes: notes || null
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Payment recorded successfully"
      });

      resetForm();
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error recording payment:', error);
      toast({
        title: "Error",
        description: "Failed to record payment",
        variant: "destructive"
      });
    }
  };

  const calculateInterest = async (farmerId: string) => {
    try {
      const { data: account } = await supabase
        .from('customer_accounts')
        .select('*')
        .eq('farmer_id', farmerId)
        .single();

      if (!account || account.current_balance <= 0) {
        toast({
          title: "Info",
          description: "No outstanding balance for interest calculation",
        });
        return;
      }

      const monthlyRate = account.interest_rate / 100;
      const interestAmount = account.current_balance * monthlyRate;

      // Add interest charge
      const { error: interestError } = await supabase
        .from('interest_charges')
        .insert([{
          farmer_id: farmerId,
          principal_amount: account.current_balance,
          interest_amount: interestAmount,
          interest_rate: account.interest_rate
        }]);

      if (interestError) throw interestError;

      // Update customer balance
      const { error: updateError } = await supabase
        .from('customer_accounts')
        .update({
          current_balance: account.current_balance + interestAmount
        })
        .eq('farmer_id', farmerId);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: `Interest of ₹${interestAmount.toFixed(2)} calculated and added`
      });

      fetchCustomerAccounts();
    } catch (error) {
      console.error('Error calculating interest:', error);
      toast({
        title: "Error",
        description: "Failed to calculate interest",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setSelectedFarmerId("");
    setSelectedBillId("");
    setPaymentAmount("");
    setPaymentMethod("cash");
    setNotes("");
  };

  const getBalanceStatus = (balance: number) => {
    if (balance > 1000) return <Badge variant="destructive">High Balance</Badge>;
    if (balance > 0) return <Badge variant="secondary">Pending</Badge>;
    return <Badge variant="default">Clear</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Outstanding Balances */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Outstanding Customer Balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Farmer Name</TableHead>
                  <TableHead>Outstanding Balance</TableHead>
                  <TableHead>Last Payment</TableHead>
                  <TableHead>Interest Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerAccounts.filter(account => account.current_balance > 0).map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.farmer?.name}</TableCell>
                    <TableCell className="text-red-600 font-bold">₹{account.current_balance.toLocaleString()}</TableCell>
                    <TableCell>
                      {account.last_payment_date 
                        ? new Date(account.last_payment_date).toLocaleDateString()
                        : 'Never'
                      }
                    </TableCell>
                    <TableCell>{account.interest_rate}% monthly</TableCell>
                    <TableCell>{getBalanceStatus(account.current_balance)}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => calculateInterest(account.farmer_id)}
                      >
                        Add Interest
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Management
            </CardTitle>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Record Payment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Record New Payment</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="farmer">Select Farmer *</Label>
                    <Select value={selectedFarmerId} onValueChange={setSelectedFarmerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose farmer" />
                      </SelectTrigger>
                      <SelectContent>
                        {farmers.map((farmer) => (
                          <SelectItem key={farmer.id} value={farmer.id}>
                            {farmer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="bill">Select Bill (Optional)</Label>
                    <Select value={selectedBillId} onValueChange={setSelectedBillId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose specific bill" />
                      </SelectTrigger>
                      <SelectContent>
                        {pendingBills
                          .filter(bill => bill.farmer_id === selectedFarmerId)
                          .map((bill) => (
                            <SelectItem key={bill.id} value={bill.id}>
                              {bill.bill_number} - ₹{bill.final_amount}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="amount">Payment Amount *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="method">Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional notes..."
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Record Payment</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Farmer</TableHead>
                  <TableHead>Bill Number</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">{payment.farmer?.name}</TableCell>
                    <TableCell>{payment.bill?.bill_number || 'General Payment'}</TableCell>
                    <TableCell className="text-green-600 font-bold">₹{payment.amount_paid}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {payment.payment_method.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>{payment.notes || '-'}</TableCell>
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

export default PaymentManagement;