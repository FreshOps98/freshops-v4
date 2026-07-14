import React, { useState } from 'react';
/**
 * ============================================================================
 * FRESHOPS VERİ AKIŞI VE DÖNÜŞÜMÜ ANALİZİ (HAMMADDELER EKRANI)
 * ============================================================================
 * 
 * 1. KULLANILAN VERİ YAPILARI:
 *    - RawMaterials (Hammaddeler) -> Hammaddelerin listesi, birimleri, varsayılan fire/verim oranları, kritik stok seviyeleri.
 *    - CurrentStocks -> Her bir hammaddenin depodaki anlık miktarını tutan hesaplanmış sözlük (Record<string, number>).
 *    - StockMovements -> Hammaddelerin ağırlıklı ortalama maliyetlerini (WAC) hesaplamak için kullanılır.
 * 
 * 2. CRUD İŞLEMLERİ VE PROP FONKSİYONLARI:
 *    - onAdd -> Yeni bir hammadde tanımlar.
 *    - onUpdate -> Hammadde detaylarını (fiyat, birim, fire oranı vb.) günceller.
 *    - onDelete -> Hammadde kaydını siler.
 * 
 * 3. GELECEK SUPABASE TABLO EŞLEŞMELERİ:
 *    - raw_materials -> Hammadde kart tanımları bu tabloya kaydedilir.
 *    - stock_movements -> Stok geçmişi ve girişler üzerinden WAC (Ağırlıklı Ortalama Maliyet) hesaplamak için veritabanında saklanır.
 *    - current_stock -> Ayrı bir tablo yerine genellikle `stock_movements` üzerinde çalışan bir SQL View veya sorgu üzerinden dinamik olarak çekilir (veritabanı tutarlılığı için bu en sağlıklı yöntemdir).
 */
import { RawMaterial, RawMaterialCategory, RawMaterialUnit, StockMovement } from '../../types';
import { formatCurrency, formatWeight } from '../../utils/format';
import { Plus, Search, Edit2, Trash2, X, AlertTriangle, Percent, ArrowUpDown } from 'lucide-react';
import { calculateWeightedAverageCost } from '../../services/calcService';

interface RawMaterialsViewProps {
  rawMaterials: RawMaterial[];
  currentStocks: Record<string, number>;
  stockMovements: StockMovement[];
  onAdd: (rm: Omit<RawMaterial, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<RawMaterial>) => void;
  onDelete: (id: string) => void;
}

export default function RawMaterialsView({
  rawMaterials,
  currentStocks,
  stockMovements,
  onAdd,
  onUpdate,
  onDelete
}: RawMaterialsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState<RawMaterialCategory>('Diğer');
  const [unit, setUnit] = useState<RawMaterialUnit>('kg');
  const [purchasePrice, setPurchasePrice] = useState<string>('45');
  const [wasteRate, setWasteRate] = useState<string>('40');
  const [yieldRate, setYieldRate] = useState<string>('60');
  const [criticalStockLevel, setCriticalStockLevel] = useState<string>('50');
  const [isActive, setIsActive] = useState(true);

  const categories: RawMaterialCategory[] = ['Meyve', 'Sebze', 'Ambalaj', 'Yardımcı Malzeme', 'Diğer'];
  const units: RawMaterialUnit[] = ['kg', 'adet', 'paket'];

  const handleOpenAddModal = () => {
    setEditingMaterial(null);
    setName('');
    setCategory('Meyve');
    setUnit('kg');
    setPurchasePrice('45');
    setWasteRate('40');
    setYieldRate('60');
    setCriticalStockLevel('50');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rm: RawMaterial) => {
    setEditingMaterial(rm);
    setName(rm.name);
    setCategory(rm.category);
    setUnit(rm.unit);
    setPurchasePrice(rm.purchasePrice.toString());
    setWasteRate(rm.defaultWasteRate.toString());
    setYieldRate(rm.defaultYieldRate.toString());
    setCriticalStockLevel(rm.criticalStockLevel.toString());
    setIsActive(rm.isActive);
    setIsModalOpen(true);
  };

  // Bidirectional Fire Rate & Yield Rate sync
  const handleWasteRateChange = (valStr: string) => {
    setWasteRate(valStr);
    const val = parseFloat(valStr);
    if (!isNaN(val)) {
      const clampedWaste = Math.max(0, Math.min(100, val));
      setYieldRate((100 - clampedWaste).toString());
    }
  };

  const handleYieldRateChange = (valStr: string) => {
    setYieldRate(valStr);
    const val = parseFloat(valStr);
    if (!isNaN(val)) {
      const clampedYield = Math.max(0, Math.min(100, val));
      setWasteRate((100 - clampedYield).toString());
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Bu hammaddeyi silmek istediğinize emin misiniz? Reçetelerde kullanılıyorsa reçete hesaplarında hata oluşabilir.')) {
      onDelete(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || name.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    if (purchasePrice === undefined || purchasePrice === null || purchasePrice.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    if (wasteRate === undefined || wasteRate === null || wasteRate.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    if (yieldRate === undefined || yieldRate === null || yieldRate.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    if (criticalStockLevel === undefined || criticalStockLevel === null || criticalStockLevel.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }

    const pp = parseFloat(purchasePrice);
    const wr = parseFloat(wasteRate);
    const yr = parseFloat(yieldRate);
    const csl = parseFloat(criticalStockLevel);

    if (isNaN(pp) || pp < 0 || isNaN(wr) || wr < 0 || isNaN(yr) || yr < 0 || isNaN(csl) || csl < 0) {
      alert('Lütfen tüm değerleri geçerli, pozitif sayılar olarak girin.');
      return;
    }

    const data = {
      name,
      category,
      unit,
      purchasePrice: pp,
      defaultWasteRate: wr,
      defaultYieldRate: yr,
      criticalStockLevel: csl,
      isActive
    };

    if (editingMaterial) {
      onUpdate(editingMaterial.id, data);
    } else {
      onAdd(data);
    }
    setIsModalOpen(false);
  };

  const filteredMaterials = rawMaterials.filter(rm => {
    const matchesSearch = rm.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'all' || rm.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Hammaddeler</h1>
          <p className="text-sm text-slate-500 mt-1">Sistemdeki tüm meyve, sebze, ambalaj ve sarf hammaddelerin listesi.</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
        >
          <Plus size={16} />
          Yeni Hammadde Tanımla
        </button>
      </div>

      {/* FILTER BUTTONS */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Hammadde adı ile ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-xs"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-emerald-500 shadow-xs"
        >
          <option value="all">Tüm Kategoriler</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* RAW MATERIALS TABLE LIST */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                <th className="py-3 px-4">Hammadde Adı</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4 text-right">Mevcut Stok</th>
                <th className="py-3 px-4">Birim</th>
                <th className="py-3 px-4 text-right">Son Alış Fiyatı</th>
                <th className="py-3 px-4 text-right">Ağırlıklı Ortalama Maliyet</th>
                <th className="py-3 px-4 text-right">Varsayılan Fire %</th>
                <th className="py-3 px-4 text-right">Kritik Stok</th>
                <th className="py-3 px-4">Durum</th>
                <th className="py-3 px-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {filteredMaterials.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-slate-400 font-medium bg-white">
                    Tanımlı hammadde bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredMaterials.map((rm) => {
                  const stock = currentStocks[rm.id] || 0;
                  const isCritical = stock <= rm.criticalStockLevel;
                  const activeMovs = stockMovements.filter(m => !m.isDeleted);
                  const avgCost = rm.averageCost ?? calculateWeightedAverageCost(rm.id, activeMovs, rm.purchasePrice);

                  return (
                    <tr key={rm.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-950">{rm.name}</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                          {rm.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className={`font-bold ${isCritical ? 'text-red-600' : 'text-slate-800'}`}>
                          {formatWeight(stock, rm.unit)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-medium">{rm.unit}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">{formatCurrency(rm.purchasePrice)}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">{formatCurrency(avgCost)}</td>
                      <td className="py-3.5 px-4 text-right text-rose-600 font-semibold">%{rm.defaultWasteRate}</td>
                      <td className="py-3.5 px-4 text-right font-medium text-amber-600">{formatWeight(rm.criticalStockLevel, rm.unit)}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${rm.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${rm.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                          {rm.isActive ? 'Aktif' : 'Pasif'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5">
                        <button
                          onClick={() => handleOpenEditModal(rm)}
                          className="p-1 text-slate-400 hover:text-emerald-600 rounded-md hover:bg-emerald-50/50 transition-all inline-block cursor-pointer"
                          title="Düzenle"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(rm.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50/50 transition-all inline-block cursor-pointer"
                          title="Sil"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD/EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editingMaterial ? 'Hammaddet Kartı Düzenle' : 'Yeni Hammadde Kartı Tanımla'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Hammadde Adı *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: İthal Ananas, Çilek vb."
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Kategori *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as RawMaterialCategory)}
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Hammadde Birimi *</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as RawMaterialUnit)}
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Alış Birim Fiyatı (TL) *</label>
                <input
                  type="text"
                  required
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="Seçili birim başına fiyat (Örn: kg fiyatı)"
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Fire ve Randiman - Interactive Sync */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider pb-1 border-b border-slate-200/50">
                  <ArrowUpDown size={12} className="text-emerald-600" />
                  <span>Fire & Randıman İlişkisi</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Varsayılan Fire Oranı %</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={wasteRate}
                        onChange={(e) => handleWasteRateChange(e.target.value)}
                        className="w-full bg-white pl-3 pr-7 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-emerald-500"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Hesaplanan Randıman %</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={yieldRate}
                        onChange={(e) => handleYieldRateChange(e.target.value)}
                        className="w-full bg-white pl-3 pr-7 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none focus:border-emerald-500"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">%</span>
                    </div>
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 italic text-center">Frenin ve verimin toplamı daima %100'dür. Birini değiştirdiğinizde diğeri otomatik hesaplanır.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Kritik Stok Seviyesi ({unit}) *</label>
                <input
                  type="text"
                  required
                  value={criticalStockLevel}
                  onChange={(e) => setCriticalStockLevel(e.target.value)}
                  placeholder="Kritik uyarı tetiklenecek stok miktarı"
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rmIsActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="rmIsActive" className="text-xs font-semibold text-slate-600 cursor-pointer">
                  Hammadde Aktif Kullanımda
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
