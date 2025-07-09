-- Create enum for product types
CREATE TYPE public.product_type AS ENUM ('insecticide', 'pesticide', 'fertilizer');

-- Create enum for payment status
CREATE TYPE public.payment_status AS ENUM ('paid', 'partial', 'pending');

-- Create products table (insecticides, pesticides, fertilizers)
CREATE TABLE public.products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    type product_type NOT NULL,
    brand TEXT,
    description TEXT,
    price_per_unit DECIMAL(10,2) NOT NULL,
    unit TEXT NOT NULL DEFAULT 'kg', -- kg, liter, packet, etc.
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create farmers table (customers)
CREATE TABLE public.farmers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    village TEXT,
    district TEXT,
    state TEXT,
    pincode TEXT,
    aadhar_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bills table
CREATE TABLE public.bills (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bill_number TEXT NOT NULL UNIQUE,
    farmer_id UUID NOT NULL REFERENCES public.farmers(id),
    total_amount DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    final_amount DECIMAL(10,2) NOT NULL,
    payment_status payment_status DEFAULT 'pending',
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bill_items table (junction table for bills and products)
CREATE TABLE public.bill_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payments table
CREATE TABLE public.payments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bill_id UUID NOT NULL REFERENCES public.bills(id),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id),
    amount_paid DECIMAL(10,2) NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create customer_accounts table for tracking balances and credit
CREATE TABLE public.customer_accounts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) UNIQUE,
    total_credit_limit DECIMAL(10,2) DEFAULT 0,
    current_balance DECIMAL(10,2) DEFAULT 0,
    last_payment_date TIMESTAMP WITH TIME ZONE,
    interest_rate DECIMAL(5,2) DEFAULT 2.0, -- Monthly interest rate percentage
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create interest_charges table
CREATE TABLE public.interest_charges (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    farmer_id UUID NOT NULL REFERENCES public.farmers(id),
    bill_id UUID REFERENCES public.bills(id),
    principal_amount DECIMAL(10,2) NOT NULL,
    interest_amount DECIMAL(10,2) NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    charge_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_charges ENABLE ROW LEVEL SECURITY;

-- Create policies (making them open for now, you can add authentication later)
CREATE POLICY "Allow all operations on products" ON public.products FOR ALL USING (true);
CREATE POLICY "Allow all operations on farmers" ON public.farmers FOR ALL USING (true);
CREATE POLICY "Allow all operations on bills" ON public.bills FOR ALL USING (true);
CREATE POLICY "Allow all operations on bill_items" ON public.bill_items FOR ALL USING (true);
CREATE POLICY "Allow all operations on payments" ON public.payments FOR ALL USING (true);
CREATE POLICY "Allow all operations on customer_accounts" ON public.customer_accounts FOR ALL USING (true);
CREATE POLICY "Allow all operations on interest_charges" ON public.interest_charges FOR ALL USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_farmers_updated_at
    BEFORE UPDATE ON public.farmers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bills_updated_at
    BEFORE UPDATE ON public.bills
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customer_accounts_updated_at
    BEFORE UPDATE ON public.customer_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-generate bill numbers
CREATE OR REPLACE FUNCTION public.generate_bill_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.bill_number IS NULL THEN
        NEW.bill_number := 'BILL-' || TO_CHAR(NEW.created_at, 'YYYYMMDD') || '-' || LPAD((
            SELECT COALESCE(MAX(CAST(SPLIT_PART(bill_number, '-', 3) AS INTEGER)), 0) + 1
            FROM public.bills 
            WHERE bill_number LIKE 'BILL-' || TO_CHAR(NEW.created_at, 'YYYYMMDD') || '-%'
        )::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-generating bill numbers
CREATE TRIGGER generate_bill_number_trigger
    BEFORE INSERT ON public.bills
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_bill_number();

-- Create function to update customer balance
CREATE OR REPLACE FUNCTION public.update_customer_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Update customer account balance when bill is created or updated
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.customer_accounts (farmer_id, current_balance)
        VALUES (NEW.farmer_id, NEW.final_amount)
        ON CONFLICT (farmer_id) 
        DO UPDATE SET 
            current_balance = customer_accounts.current_balance + NEW.final_amount,
            updated_at = now();
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.customer_accounts
        SET current_balance = current_balance - OLD.final_amount + NEW.final_amount,
            updated_at = now()
        WHERE farmer_id = NEW.farmer_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update customer balance when bills change
CREATE TRIGGER update_customer_balance_trigger
    AFTER INSERT OR UPDATE ON public.bills
    FOR EACH ROW
    EXECUTE FUNCTION public.update_customer_balance();

-- Create function to handle payments
CREATE OR REPLACE FUNCTION public.process_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- Reduce customer balance when payment is made
    UPDATE public.customer_accounts
    SET current_balance = current_balance - NEW.amount_paid,
        last_payment_date = NEW.payment_date,
        updated_at = now()
    WHERE farmer_id = NEW.farmer_id;
    
    -- Update bill payment status
    UPDATE public.bills
    SET payment_status = CASE 
        WHEN (SELECT SUM(amount_paid) FROM public.payments WHERE bill_id = NEW.bill_id) >= final_amount 
        THEN 'paid'::payment_status
        ELSE 'partial'::payment_status
    END,
    updated_at = now()
    WHERE id = NEW.bill_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for payment processing
CREATE TRIGGER process_payment_trigger
    AFTER INSERT ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.process_payment();

-- Enable realtime for all tables
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.farmers REPLICA IDENTITY FULL;
ALTER TABLE public.bills REPLICA IDENTITY FULL;
ALTER TABLE public.bill_items REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.customer_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.interest_charges REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.farmers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bill_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.interest_charges;