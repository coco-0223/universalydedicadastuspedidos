// Run this snippet in your Supabase SQL Editor to create the schema

-- Enable UUID extension globally
create extension if not exists "uuid-ossp";

-----------------------------------------------------
-- 1. PROFILES (Business Owners & Clients combined)
-----------------------------------------------------
create type account_role as enum ('client', 'business', 'admin');

create table public.profiles (
  id uuid references auth.users not null primary key,
  role account_role not null default 'client',
  name text not null,
  surname text,
  address text,
  phone text,
  has_ordered_before boolean default false,
  
  -- Tenant config (only used if role = 'business')
  tenant_id text unique, -- ej: "pepe", "juan"
  business_name text,
  business_description text,
  logo_url text,
  banner_url text,
  primary_color text default '#10b981',
  secondary_color text,
  accent_color text,
  
  -- Settings JSON for businesses
  brand_settings jsonb default '{}'::jsonb,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-----------------------------------------------------
-- 2. PRODUCTS
-----------------------------------------------------
create table public.products (
  id uuid default uuid_generate_v4() primary key,
  tenant_id text references public.profiles(tenant_id) not null,
  
  name text not null,
  description text,
  price numeric(10,2) not null,
  promotional_price numeric(10,2),
  is_offer_active boolean default false,
  image_url text,
  category text not null,
  available boolean default true,
  featured boolean default false,
  
  -- Variants handling
  group_id text,
  min_quantity_for_group_price numeric default 1,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-----------------------------------------------------
-- 3. OFFERS (Combos)
-----------------------------------------------------
create table public.offers (
  id uuid default uuid_generate_v4() primary key,
  tenant_id text references public.profiles(tenant_id) not null,
  
  name text not null,
  description text,
  bundle_price numeric(10,2) not null,
  active boolean default true,
  categories text[] default '{}',
  
  -- Requisitos almacenados en formato JSON [{productId, quantity}]
  requirements jsonb not null default '[]'::jsonb,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-----------------------------------------------------
-- 4. ORDERS
-----------------------------------------------------
create type order_status as enum ('pending', 'confirmed', 'ready', 'delivered', 'cancelled');
create type delivery_method as enum ('pickup', 'delivery');

create table public.orders (
  id text primary key, -- Custom short ID
  tenant_id text references public.profiles(tenant_id) not null,
  client_id uuid references public.profiles(id) not null,
  
  -- Resumen financiero
  subtotal numeric(10,2) not null,
  discount_applied numeric(10,2) default 0,
  delivery_cost numeric(10,2) default 0,
  total_price numeric(10,2) not null,
  is_custom_total boolean default false,
  
  -- Detalles de envío/retiro
  status order_status default 'pending' not null,
  delivery_method delivery_method not null,
  branch_id text,
  scheduled_time timestamp with time zone not null,
  notes text,
  
  -- Historial JSON [{productId, quantity, actualQuantity, actualPrice}]
  items jsonb not null,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);


-- SET UP RLS (Row Level Security)

-- Turn ON protection
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.orders enable row level security;

-- Policies for "products" (Read any, Edit only if tenant matches)
create policy "Products are viewable by everyone" on public.products for select using (true);
create policy "Business can modify their own products" on public.products for all using (
  auth.uid() in (select id from public.profiles where tenant_id = products.tenant_id and role = 'business')
);

-- Policies for "offers"
create policy "Offers are viewable by everyone" on public.offers for select using (true);
create policy "Business can modify their own offers" on public.offers for all using (
  auth.uid() in (select id from public.profiles where tenant_id = offers.tenant_id and role = 'business')
);

-- Policies for "orders"
-- Clients see their own orders. Businesses see orders assigned to their tenant.
create policy "Clients can view their own orders" on public.orders for select using (auth.uid() = client_id);
create policy "Businesses can view orders for their tier" on public.orders for select using (
  auth.uid() in (select id from public.profiles where tenant_id = orders.tenant_id and role = 'business')
);
-- Clients can Insert orders for themselves
create policy "Clients can create orders" on public.orders for insert with check (auth.uid() = client_id);
-- Businesses can edit orders
create policy "Businesses can edit their orders" on public.orders for update using (
  auth.uid() in (select id from public.profiles where tenant_id = orders.tenant_id and role = 'business')
);
