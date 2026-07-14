import React, { useState } from 'react';
/**
 * ============================================================================
 * FRESHOPS VERİ AKIŞI VE DÖNÜŞÜMÜ ANALİZİ (MÜŞTERİLER/CRM EKRANI)
 * ============================================================================
 * 
 * 1. KULLANILAN VERİ YAPILARI:
 *    - Customers -> Tüm müşterilerin listesi, iletişim bilgileri, tipleri ve özel teslimat notları.
 *    - Orders & OrderItems -> Müşterilerin sipariş geçmişini ve toplam sipariş tutarını hesaplamak için kullanılır.
 *    - Products -> Sipariş içeriklerindeki ürün isimlerini bulmak için.
 * 
 * 2. CRUD İŞLEMLERİ VE PROP FONKSİYONLARI:
 *    - onAdd (Ekleme) -> Yeni bir müşteri eklemek için üst bileşene (App.tsx) veri yollar.
 *    - onUpdate (Güncelleme) -> Mevcut müşterinin bilgilerini (adres, telefon, vb.) güncellemek için tetiklenir.
 *    - onDelete (Silme) -> Müşteriyi sistemden kaldırmak için tetiklenir.
 * 
 * 3. GELECEK SUPABASE TABLO EŞLEŞMELERİ:
 *    - customers -> Müşteri kartı bilgileri bu tabloya doğrudan yazılır/okunur.
 *    - orders & order_items -> Sipariş geçmişi ilişkisel sorgu (JOIN) ile doğrudan veritabanı seviyesinde çekilebilir.
 */
import { Customer, CustomerType, Order, OrderItem, Product, FinishedGoodsMovement } from '../../types';
import { formatCurrency, formatDate } from '../../utils/format';
import { getTodayISO, parseISODateSafe } from '../../utils/dateHelper';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  X, 
  ChevronRight, 
  DollarSign, 
  ShoppingBag, 
  TrendingUp, 
  ArrowLeft 
} from 'lucide-react';

interface CustomersViewProps {
  customers: Customer[];
  orders: Order[];
  orderItems: OrderItem[];
  products: Product[];
  finishedGoodsMovements: FinishedGoodsMovement[];
  onAdd: (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<Customer>) => void;
  onDelete: (id: string) => void;
}

export default function CustomersView({
  customers,
  orders,
  orderItems,
  products,
  finishedGoodsMovements,
  onAdd,
  onUpdate,
  onDelete
}: CustomersViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomerType>('Diğer');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [isActive, setIsActive] = useState(true);

  const customerTypes: CustomerType[] = ['Otel', 'Kafe', 'Restoran', 'Catering', 'Market', 'Kurumsal', 'Diğer'];

  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setName('');
    setType('Diğer');
    setPhone('');
    setEmail('');
    setAddress('');
    setDeliveryNote('');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cust: Customer, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening details
    setEditingCustomer(cust);
    setName(cust.name);
    setType(cust.type);
    setPhone(cust.phone);
    setEmail(cust.email);
    setAddress(cust.address);
    setDeliveryNote(cust.deliveryNote);
    setIsActive(cust.isActive);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Bu müşteriyi silmek istediğinize emin misiniz?')) {
      onDelete(id);
      if (detailCustomer?.id === id) {
        setDetailCustomer(null);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const data = { name, type, phone, email, address, deliveryNote, isActive };

    if (editingCustomer) {
      onUpdate(editingCustomer.id, data);
    } else {
      onAdd(data);
    }
    setIsModalOpen(false);
  };

  const handleOpenDetail = (cust: Customer) => {
    setDetailCustomer(cust);
  };

  // Filter customers
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.phone.includes(searchTerm) || 
                          c.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'all' || c.type === selectedType;
    return matchesSearch && matchesType;
  });

  // Calculate stats for detail view
  const getCustomerStats = (customerId: string) => {
    const custOrders = orders.filter(o => o.customerId === customerId);
    const totalSiparis = custOrders.length;
    
    const upcomingDeliveries = custOrders.filter(o => {
      const deliveryDate = parseISODateSafe(o.deliveryDate);
      const today = parseISODateSafe(getTodayISO());
      return deliveryDate >= today && o.status !== 'Sevk Edildi' && o.status !== 'İptal';
    });

    const pastDeliveries = custOrders.filter(o => o.status === 'Sevk Edildi');

    let totalCiro = 0;
    const productCountMap: Record<string, number> = {};

    for (const order of custOrders) {
      if (order.status === 'İptal') continue;
      const items = orderItems.filter(i => i.orderId === order.id);
      for (const item of items) {
        const shippedQuantity = finishedGoodsMovements
          .filter(m => m.orderItemId === item.id && m.type === 'Sevkiyat çıkışı' && !m.isDeleted)
          .reduce((sum, m) => sum + (m.quantity || 0), 0);
          
        totalCiro += shippedQuantity * item.unitSalePrice;
        
        // Count either shipped quantity or ordered quantity for product count map
        const qtyToCount = shippedQuantity > 0 ? shippedQuantity : item.quantity;
        productCountMap[item.productId] = (productCountMap[item.productId] || 0) + qtyToCount;
      }
    }

    const mostPurchasedProducts = Object.keys(productCountMap)
      .map(id => {
        const prod = products.find(p => p.id === id);
        return {
          name: prod?.name || 'Bilinmeyen Ürün',
          quantity: productCountMap[id]
        };
      })
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      totalSiparis,
      upcomingDeliveries,
      pastDeliveries,
      totalCiro,
      mostPurchasedProducts
    };
  };

  const stats = detailCustomer ? getCustomerStats(detailCustomer.id) : null;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Müşteriler</h1>
          <p className="text-sm text-slate-500 mt-1">Müşteri listesi, profil detayları ve satın alma analizleri.</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
        >
          <Plus size={16} />
          Yeni Müşteri Ekle
        </button>
      </div>

      {detailCustomer ? (
        /* CUSTOMER DETAILS PANEL */
        <div className="space-y-6">
          <button
            onClick={() => setDetailCustomer(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-600 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            Müşteri Listesine Dön
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Customer Info Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                  {detailCustomer.type}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${detailCustomer.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${detailCustomer.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  {detailCustomer.isActive ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">{detailCustomer.name}</h2>
                <p className="text-xs text-slate-400 mt-1">Kayıt: {formatDate(detailCustomer.createdAt)}</p>
              </div>

              <div className="border-t border-slate-50 pt-4 space-y-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <span>{detailCustomer.phone || 'Telefon belirtilmemiş'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-slate-400 shrink-0" />
                  <span className="truncate">{detailCustomer.email || 'E-posta belirtilmemiş'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  <span>{detailCustomer.address || 'Adres belirtilmemiş'}</span>
                </div>
                {detailCustomer.deliveryNote && (
                  <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-2">
                    <FileText size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-700">Teslimat Notu:</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{detailCustomer.deliveryNote}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={(e) => handleOpenEditModal(detailCustomer, e)}
                  className="flex-1 py-2 text-center text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors cursor-pointer"
                >
                  Düzenle
                </button>
                <button
                  onClick={(e) => handleDelete(detailCustomer.id, e)}
                  className="px-3 py-2 text-center text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Customer Stats Cards */}
            <div className="lg:col-span-2 space-y-6">
              {/* Stats Overview */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
                    <DollarSign size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-slate-400 uppercase">Toplam Ciro</p>
                    <p className="text-sm font-bold text-slate-800">{formatCurrency(stats?.totalCiro || 0)}</p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-slate-400 uppercase">Toplam Sipariş</p>
                    <p className="text-sm font-bold text-slate-800">{stats?.totalSiparis} Sipariş</p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-slate-400 uppercase">Bekleyen</p>
                    <p className="text-sm font-bold text-slate-800">{stats?.upcomingDeliveries.length} Sevk</p>
                  </div>
                </div>
              </div>

              {/* Grid content */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* En Çok Alınan Ürünler */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">En Çok Tercih Ettiği Ürünler</h3>
                  {stats?.mostPurchasedProducts.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">Henüz sipariş kaydı yok.</p>
                  ) : (
                    <div className="space-y-3">
                      {stats?.mostPurchasedProducts.map((p, i) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-700">{p.name}</span>
                          <span className="text-slate-500 bg-slate-50 px-2 py-1 rounded-lg font-bold">{p.quantity} Paket</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Yaklaşan Teslimatlar */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Yaklaşan Teslimat Planları</h3>
                  {stats?.upcomingDeliveries.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">Bekleyen teslimat bulunmuyor.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-[160px] overflow-y-auto">
                      {stats?.upcomingDeliveries.map((o) => (
                        <div key={o.id} className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
                          <div>
                            <span className="font-semibold block text-slate-700">Tarih: {formatDate(o.deliveryDate)}</span>
                            <span className="text-[10px] text-slate-400">Durum: {o.status}</span>
                          </div>
                          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">
                            {o.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Geçmiş Siparişler */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Geçmiş Teslimatlar (Sevk Edildi)</h3>
                {stats?.pastDeliveries.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">Sevk edilmiş sipariş bulunmuyor.</p>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {stats?.pastDeliveries.map((o) => (
                      <div key={o.id} className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
                        <div>
                          <span className="font-semibold block text-slate-700">Sevk Tarihi: {formatDate(o.deliveryDate)}</span>
                          <span className="text-[10px] text-slate-400">Sipariş ID: {o.id}</span>
                        </div>
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                          Sevk Edildi
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* CUSTOMERS LIST VIEW */
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Müşteri adı, e-posta veya telefon ile ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-xs"
              />
            </div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-xs"
            >
              <option value="all">Tüm Müşteri Tipleri</option>
              {customerTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Table list */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                    <th className="py-3 px-4">Müşteri Adı</th>
                    <th className="py-3 px-4">Tip</th>
                    <th className="py-3 px-4">Telefon</th>
                    <th className="py-3 px-4">Konum</th>
                    <th className="py-3 px-4">Durum</th>
                    <th className="py-3 px-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400 font-medium bg-white">
                        Aranan kriterlere uygun müşteri bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((cust) => (
                      <tr
                        key={cust.id}
                        onClick={() => handleOpenDetail(cust)}
                        className="hover:bg-slate-50/50 cursor-pointer group transition-colors"
                      >
                        <td className="py-3 px-4 font-semibold text-slate-900">{cust.name}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                            {cust.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{cust.phone || '-'}</td>
                        <td className="py-3 px-4 max-w-[150px] truncate text-slate-400">{cust.address || '-'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${cust.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cust.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                            {cust.isActive ? 'Aktif' : 'Pasif'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleOpenEditModal(cust, e)}
                            className="p-1 text-slate-400 hover:text-emerald-600 rounded-md hover:bg-emerald-50/50 transition-all inline-block"
                            title="Düzenle"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(cust.id, e)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50/50 transition-all inline-block"
                            title="Sil"
                          >
                            <Trash2 size={13} />
                          </button>
                          <ChevronRight size={14} className="text-slate-300 group-hover:text-emerald-500 inline-block transition-colors" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ADD/EDIT CUSTOMER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editingCustomer ? 'Müşteri Düzenle' : 'Yeni Müşteri Ekle'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Müşteri Adı *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Müşteri firması veya şahıs ismi"
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Müşteri Tipi *</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as CustomerType)}
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  >
                    {customerTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Telefon</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Örn: 0555 123 4567"
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">E-Posta</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Örn: info@firma.com"
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Adres</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Sevk adresi..."
                  rows={2}
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Teslimat Notu (Sevk Koşulları)</label>
                <input
                  type="text"
                  value={deliveryNote}
                  onChange={(e) => setDeliveryNote(e.target.value)}
                  placeholder="Örn: Mal kabul saat 09:00 sonrası, Arka kapıdan."
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-slate-300 rounded-md focus:ring-emerald-500"
                />
                <label htmlFor="isActive" className="text-xs font-semibold text-slate-600 cursor-pointer">
                  Müşteri Aktif Durumda
                </label>
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-50 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 cursor-pointer"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
