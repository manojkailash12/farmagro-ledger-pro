-- Create profiles table for user information
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    shop_name TEXT,
    owner_name TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Update existing table policies to be user-specific
DROP POLICY "Allow all operations on products" ON public.products;
DROP POLICY "Allow all operations on farmers" ON public.farmers;
DROP POLICY "Allow all operations on bills" ON public.bills;
DROP POLICY "Allow all operations on bill_items" ON public.bill_items;
DROP POLICY "Allow all operations on payments" ON public.payments;
DROP POLICY "Allow all operations on customer_accounts" ON public.customer_accounts;
DROP POLICY "Allow all operations on interest_charges" ON public.interest_charges;

-- Add user_id column to tables for multi-tenancy
ALTER TABLE public.products ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.farmers ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.bills ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.customer_accounts ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.interest_charges ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create new user-specific policies
CREATE POLICY "Users can manage their own products" ON public.products FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own farmers" ON public.farmers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own bills" ON public.bills FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view bill items for their bills" ON public.bill_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.bills WHERE bills.id = bill_items.bill_id AND bills.user_id = auth.uid())
);
CREATE POLICY "Users can insert bill items for their bills" ON public.bill_items FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.bills WHERE bills.id = bill_items.bill_id AND bills.user_id = auth.uid())
);
CREATE POLICY "Users can manage their own payments" ON public.payments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own customer accounts" ON public.customer_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own interest charges" ON public.interest_charges FOR ALL USING (auth.uid() = user_id);

-- Create function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, owner_name)
    VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user profile creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Update triggers to include user_id
CREATE OR REPLACE FUNCTION public.update_customer_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Update customer account balance when bill is created or updated
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.customer_accounts (farmer_id, current_balance, user_id)
        VALUES (NEW.farmer_id, NEW.final_amount, NEW.user_id)
        ON CONFLICT (farmer_id) 
        DO UPDATE SET 
            current_balance = customer_accounts.current_balance + NEW.final_amount,
            updated_at = now();
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.customer_accounts
        SET current_balance = current_balance - OLD.final_amount + NEW.final_amount,
            updated_at = now()
        WHERE farmer_id = NEW.farmer_id AND user_id = NEW.user_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.process_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- Reduce customer balance when payment is made
    UPDATE public.customer_accounts
    SET current_balance = current_balance - NEW.amount_paid,
        last_payment_date = NEW.payment_date,
        updated_at = now()
    WHERE farmer_id = NEW.farmer_id AND user_id = NEW.user_id;
    
    -- Update bill payment status
    UPDATE public.bills
    SET payment_status = CASE 
        WHEN (SELECT SUM(amount_paid) FROM public.payments WHERE bill_id = NEW.bill_id AND user_id = NEW.user_id) >= final_amount 
        THEN 'paid'::payment_status
        ELSE 'partial'::payment_status
    END,
    updated_at = now()
    WHERE id = NEW.bill_id AND user_id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;