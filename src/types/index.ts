export interface Product {
  id: string;
  name: string;
  type: 'insecticide' | 'pesticide' | 'fertilizer';
  brand?: string;
  description?: string;
  price_per_unit: number;
  unit: string;
  stock_quantity: number;
  reorder_level: number;
  created_at: string;
  updated_at: string;
}

export interface Farmer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  village?: string;
  district?: string;
  state?: string;
  pincode?: string;
  aadhar_number?: string;
  created_at: string;
  updated_at: string;
}

export interface Bill {
  id: string;
  bill_number: string;
  farmer_id: string;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  payment_status: 'paid' | 'partial' | 'pending';
  due_date?: string;
  created_at: string;
  updated_at: string;
  farmer?: Farmer;
  bill_items?: BillItem[];
}

export interface BillItem {
  id: string;
  bill_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  product?: Product;
}

export interface Payment {
  id: string;
  bill_id: string;
  farmer_id: string;
  amount_paid: number;
  payment_method: string;
  payment_date: string;
  notes?: string;
  created_at: string;
  farmer?: Farmer;
  bill?: Bill;
}

export interface CustomerAccount {
  id: string;
  farmer_id: string;
  total_credit_limit: number;
  current_balance: number;
  last_payment_date?: string;
  interest_rate: number;
  created_at: string;
  updated_at: string;
  farmer?: Farmer;
}

export interface InterestCharge {
  id: string;
  farmer_id: string;
  bill_id?: string;
  principal_amount: number;
  interest_amount: number;
  interest_rate: number;
  charge_date: string;
  created_at: string;
}