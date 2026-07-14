import React, { useState } from 'react';
/**
 * ============================================================================
 * FRESHOPS VERİ AKIŞI VE DÖNÜŞÜMÜ ANALİZİ (ÜRÜNLER VE REÇETELER EKRANI)
 * ============================================================================
 * 
 * 1. KULLANILAN VERİ YAPILARI:
 *    - Products (Ürünler) -> Mamul isimleri, kategorileri, paket ağırlıkları (gram), satış fiyatları, güvenlik payları.
 *    - Recipes (Ürün Reçeteleri) -> Her bir ürün için hangi hammaddeden ne kadar (kg/adet) kullanılacağı bilgisi.
 *    - RawMaterials -> Reçeteye eklenebilecek hammaddelerin isimleri, birimleri ve maliyetleri.
 *    - CostSettings & StockMovements -> Ağırlıklı ortalama birim maliyetlerini hesaplamak için gereklidir.
 * 
 * 2. CRUD İŞLEMLERİ VE PROP FONKSİYONLARI:
 *    - onAddProduct -> Yeni bir mamul ürün kartı tanımlar.
 *    - onUpdateProduct -> Mamul ürün bilgilerini (fiyat, kategori vb.) günceller.
 *    - onDeleteProduct -> Mamul ürünü siler (tüm bağlı reçete satırlarını da temizler).
 *    - onAddRecipeItem -> Ürünün reçetesine hammadde bileşeni ve miktarı ekler.
 *    - onUpdateRecipeItem -> Reçetede kullanılan hammadde miktarını günceller.
 *    - onDeleteRecipeItem -> Reçeteden hammadde satırını siler.
 * 
 * 3. GELECEK SUPABASE TABLO EŞLEŞMELERİ:
 *    - products -> Mamul kartları bu tabloya doğrudan yazılır.
 *    - product_recipes -> Reçete kalemleri `product_id` ve `raw_material_id` ilişkisel anahtarlarıyla bu tabloya yazılır.
 *    - raw_materials -> Reçete tanımlanırken hammadde referansı için JOIN yapılır.
 */
import { Product, ProductCategory, ProductRecipeItem, RawMaterial, CostSettings, StockMovement } from '../../types';
import { 
  calculateNetRequirement, 
  calculateSafetyAdjustedRequirement, 
  calculateGrossRequirement, 
  calculateEstimatedWaste, 
  calculateProductCost,
  calculateWeightedAverageCost
} from '../../services/calcService';
import { formatCurrency, formatWeight } from '../../utils/format';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X, 
  ChevronRight, 
  FileSpreadsheet, 
  AlertCircle, 
  ArrowLeft, 
  Calculator, 
  Settings, 
  Percent, 
  CheckCircle 
} from 'lucide-react';

interface ProductsViewProps {
  products: Product[];
  recipes: ProductRecipeItem[];
  rawMaterials: RawMaterial[];
  costSettings: CostSettings;
  stockMovements: StockMovement[];
  onAddProduct: (prod: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Product | Promise<Product>;
  onUpdateProduct: (id: string, updates: Partial<Product>) => void;
  onDeleteProduct: (id: string) => void;
  onAddRecipeItem: (item: Omit<ProductRecipeItem, 'id'>) => void;
  onUpdateRecipeItem: (id: string, updates: Partial<ProductRecipeItem>) => void;
  onDeleteRecipeItem: (id: string) => void;
}

export default function ProductsView({
  products,
  recipes,
  rawMaterials,
  costSettings,
  stockMovements,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onAddRecipeItem,
  onUpdateRecipeItem,
  onDeleteRecipeItem
}: ProductsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Views states
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  
  // Test Calculator state
  const [testQuantity, setTestQuantity] = useState<number>(350);

  // Form states - Product
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ProductCategory>('Diğer');
  const [packageWeightGrams, setPackageWeightGrams] = useState<string>('125');
  const [salePrice, setSalePrice] = useState<string>('35');
  const [defaultSafetyRate, setDefaultSafetyRate] = useState<string>('3');
  const [isActive, setIsActive] = useState(true);
  const [lotPrefix, setLotPrefix] = useState('');

  const normalizeLotPrefix = (val: string): string => {
    return val.toUpperCase()
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ş/g, 'S')
      .replace(/İ/g, 'I')
      .replace(/Ö/g, 'O')
      .replace(/Ç/g, 'C')
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 3)
      .trim();
  };

  const handleLotPrefixChange = (val: string) => {
    setLotPrefix(normalizeLotPrefix(val));
  };

  // Form states - Recipe Item
  const [recipeRawMaterialId, setRecipeRawMaterialId] = useState('');
  const [recipeQuantity, setRecipeQuantity] = useState<string>('100');
  const [recipeWasteOverride, setRecipeWasteOverride] = useState<string>(''); // string to handle empty/undefined

  const productCategories: ProductCategory[] = [
    'Ananas', 
    'Meyve Mix', 
    'Sebze Mix', 
    'Salata Mix', 
    'Tekli Meyve', 
    'Tekli Sebze', 
    'Diğer'
  ];

  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setName('');
    setCategory('Diğer');
    setPackageWeightGrams('125');
    setSalePrice('35');
    setDefaultSafetyRate('3');
    setIsActive(true);
    setLotPrefix('');
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProduct(prod);
    setName(prod.name);
    setCategory(prod.category);
    setPackageWeightGrams(prod.packageWeightGrams.toString());
    setSalePrice(prod.salePrice.toString());
    setDefaultSafetyRate(prod.defaultSafetyRate.toString());
    setIsActive(prod.isActive);
    setLotPrefix(prod.lotPrefix || '');
    setIsProductModalOpen(true);
  };

  const handleDeleteProduct = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Bu ürünü ve reçetesini silmek istediğinize emin misiniz?')) {
      onDeleteProduct(id);
      if (detailProduct?.id === id) {
        setDetailProduct(null);
      }
    }
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || name.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    if (packageWeightGrams === undefined || packageWeightGrams === null || packageWeightGrams.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    if (salePrice === undefined || salePrice === null || salePrice.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    if (defaultSafetyRate === undefined || defaultSafetyRate === null || defaultSafetyRate.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }

    const pw = parseInt(packageWeightGrams, 10);
    const sp = parseFloat(salePrice);
    const sr = parseFloat(defaultSafetyRate);

    if (isNaN(pw) || pw <= 0 || isNaN(sp) || sp < 0 || isNaN(sr) || sr < 0) {
      alert('Lütfen tüm değerleri geçerli, pozitif sayılar olarak girin.');
      return;
    }

    const cleanPrefix = normalizeLotPrefix(lotPrefix);
    if (cleanPrefix.length > 0 && cleanPrefix.length < 3) {
      alert('Parti ön kodu 3 karakter olmalıdır.');
      return;
    }

    const data = {
      name,
      category,
      packageWeightGrams: pw,
      salePrice: sp,
      defaultSafetyRate: sr,
      isActive,
      lotPrefix: cleanPrefix || undefined
    };

    if (editingProduct) {
      onUpdateProduct(editingProduct.id, data);
      setIsProductModalOpen(false);
      if (detailProduct?.id === editingProduct.id) {
        setDetailProduct({ ...detailProduct, ...data });
      }
    } else {
      const created = onAddProduct(data);
      setIsProductModalOpen(false);
      // open details immediately to build recipe
      if (created instanceof Promise) {
        created.then((p) => {
          setDetailProduct(p);
        }).catch(err => {
          console.error("Failed to add product:", err);
        });
      } else {
        setDetailProduct(created);
      }
    }
  };

  // Recipe item operations
  const handleAddRecipeItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailProduct || !recipeRawMaterialId) return;

    const selectedRm = rawMaterials.find(r => r.id === recipeRawMaterialId);
    if (!selectedRm) return;

    if (recipeQuantity === undefined || recipeQuantity === null || recipeQuantity.trim() === '') {
      alert('Bu alan boş bırakılamaz.');
      return;
    }
    const rq = parseFloat(recipeQuantity);
    if (isNaN(rq) || rq <= 0) {
      alert('Lütfen geçerli bir miktar girin.');
      return;
    }

    onAddRecipeItem({
      productId: detailProduct.id,
      rawMaterialId: recipeRawMaterialId,
      quantity: rq,
      unit: selectedRm.unit === 'kg' ? 'g' : selectedRm.unit, // default weight ingredients in grams for packing
      wasteRateOverride: recipeWasteOverride ? parseFloat(recipeWasteOverride) : undefined
    });

    setRecipeRawMaterialId('');
    setRecipeQuantity('100');
    setRecipeWasteOverride('');
  };

  const handleDeleteRecipeItem = (id: string) => {
    onDeleteRecipeItem(id);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Calculate product details & recipe verification
  const getProductRecipeDetails = (productId: string) => {
    const productRecipes = recipes.filter(r => r.productId === productId);
    
    // Sum of gram-based recipe ingredients (exclude packaging and adet-based, wait! Let's check: only sum items whose unit is 'g' or where raw material unit is 'kg')
    let recipeGramSum = 0;
    const items = productRecipes.map(recipe => {
      const rm = rawMaterials.find(m => m.id === recipe.rawMaterialId);
      const isKgBased = rm?.unit === 'kg';
      const displayQuantity = recipe.quantity;
      const displayUnit = recipe.unit;

      if (recipe.unit === 'g') {
        recipeGramSum += recipe.quantity;
      }

      return {
        recipe,
        rawMaterial: rm,
        isKgBased,
        displayQuantity,
        displayUnit
      };
    });

    return {
      items,
      recipeGramSum
    };
  };

  const recipeDetails = detailProduct ? getProductRecipeDetails(detailProduct.id) : null;
  const isGramMatch = detailProduct && recipeDetails 
    ? Math.abs(recipeDetails.recipeGramSum - detailProduct.packageWeightGrams) < 0.1
    : true;

  // TEST CALCULATOR CALCULATIONS FOR SELECTED PRODUCT
  const calculateTestPreview = () => {
    if (!detailProduct || !recipeDetails) return null;

    const breakdownItems = recipeDetails.items.map(({ recipe, rawMaterial }) => {
      if (!rawMaterial) return null;

      // priority resolution
      const safetyRate = detailProduct.defaultSafetyRate; 
      const wasteRate = recipe.wasteRateOverride !== undefined ? recipe.wasteRateOverride : rawMaterial.defaultWasteRate;
      const yieldRate = 100 - wasteRate;

      // Net Requirement (g to kg if material is kg/g)
      const netReq = calculateNetRequirement(testQuantity, recipe.quantity, rawMaterial.unit === 'kg' ? 'kg' : rawMaterial.unit);
      const safetyAdj = calculateSafetyAdjustedRequirement(netReq, safetyRate);
      const grossReq = calculateGrossRequirement(safetyAdj, wasteRate);
      const estWaste = calculateEstimatedWaste(grossReq, safetyAdj);
      const cost = grossReq * (rawMaterial.averageCost ?? calculateWeightedAverageCost(rawMaterial.id, stockMovements || [], rawMaterial.purchasePrice));

      return {
        rawMaterialName: rawMaterial.name,
        unit: rawMaterial.unit,
        netReq,
        safetyRate,
        safetyAdj,
        wasteRate,
        yieldRate,
        grossReq,
        estWaste,
        cost
      };
    }).filter(Boolean) as any[];

    // Package-level costs
    const costBreakdown = calculateProductCost(detailProduct, recipes, rawMaterials, costSettings, stockMovements);
    const testTotalCost = costBreakdown.totalCostPerPackage * testQuantity;
    const testRevenue = detailProduct.salePrice * testQuantity;
    const testProfit = testRevenue - testTotalCost;
    const profitMargin = testRevenue > 0 ? (testProfit / testRevenue) * 100 : 0;

    return {
      items: breakdownItems,
      totalCost: testTotalCost,
      revenue: testRevenue,
      profit: testProfit,
      margin: profitMargin,
      costBreakdown
    };
  };

  const preview = detailProduct ? calculateTestPreview() : null;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Ürünler ve Reçeteler</h1>
          <p className="text-sm text-slate-500 mt-1">Paketli taze ürün katalog yönetimi ve reçete formülasyonları.</p>
        </div>
        {!detailProduct && (
          <button
            onClick={handleOpenAddProduct}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
          >
            <Plus size={16} />
            Yeni Ürün Ekle
          </button>
        )}
      </div>

      {detailProduct && recipeDetails ? (
        /* PRODUCT DETAIL & RECIPE MANAGEMENT */
        <div className="space-y-6">
          <button
            onClick={() => setDetailProduct(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-emerald-600 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            Ürün Kataloğuna Dön
          </button>

          {/* Product general info */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700">
                  {detailProduct.category}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${detailProduct.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${detailProduct.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  {detailProduct.isActive ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-800">{detailProduct.name}</h2>
              <p className="text-xs text-slate-400">Paket Başı Satış Fiyatı: <span className="font-semibold text-slate-700">{formatCurrency(detailProduct.salePrice)}</span></p>
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-600 self-start md:self-center bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <p className="text-slate-400 text-[10px] uppercase">Paket Gramajı</p>
                <p className="text-sm font-bold text-slate-800">{detailProduct.packageWeightGrams} g</p>
              </div>
              <div className="border-l border-slate-200 pl-4">
                <p className="text-slate-400 text-[10px] uppercase">Reçete Toplamı</p>
                <p className={`text-sm font-bold ${isGramMatch ? 'text-emerald-600' : 'text-amber-600'}`}>{recipeDetails.recipeGramSum} g</p>
              </div>
              <div className="border-l border-slate-200 pl-4">
                <p className="text-slate-400 text-[10px] uppercase">Güvenlik Payı</p>
                <p className="text-sm font-bold text-slate-800">%{detailProduct.defaultSafetyRate}</p>
              </div>
              <div className="border-l border-slate-200 pl-4">
                <p className="text-slate-400 text-[10px] uppercase">Parti Ön Kodu</p>
                <p className="text-sm font-bold text-slate-800">{detailProduct.lotPrefix || 'Tanımsız'}</p>
              </div>
              <div className="border-l border-slate-200 pl-4 flex items-center gap-1.5">
                <button
                  onClick={(e) => handleOpenEditProduct(detailProduct, e)}
                  className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                  title="Ürünü Düzenle"
                >
                  <Edit2 size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* Grammar Mismatch Warning */}
          {!isGramMatch && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-2.5 items-start">
              <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-xs font-bold text-amber-800">Uyumsuzluk Uyarısı:</h4>
                <p className="text-xs text-amber-700 mt-0.5">
                  Reçete toplamı ({recipeDetails.recipeGramSum} g) paket gramajıyla ({detailProduct.packageWeightGrams} g) eşleşmiyor. 
                  Lütfen reçetedeki meyve/sebze gramajlarını düzenleyin.
                </p>
              </div>
            </div>
          )}

          {/* Grid: Recipes Manager & Interactive Calculator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* 1. RECIPE EDITOR (7 columns) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                <h3 className="text-sm font-bold text-slate-800">Ürün Reçete Detayı</h3>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                  {recipeDetails.items.length} Kalem
                </span>
              </div>

              {/* Add Recipe Item Form */}
              <form onSubmit={handleAddRecipeItemSubmit} className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Hammadde Seç *</label>
                  <select
                    required
                    value={recipeRawMaterialId}
                    onChange={(e) => setRecipeRawMaterialId(e.target.value)}
                    className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  >
                    <option value="">-- Hammadde Seçin --</option>
                    {rawMaterials
                      .filter(rm => rm.isActive && !recipeDetails.items.some(i => i.recipe.rawMaterialId === rm.id))
                      .map(rm => (
                        <option key={rm.id} value={rm.id}>
                          {rm.name} ({rm.category}) [{rm.unit}]
                        </option>
                      ))}
                  </select>
                </div>
                
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Miktar (g / adet)</label>
                  <input
                    type="text"
                    required
                    value={recipeQuantity}
                    onChange={(e) => setRecipeQuantity(e.target.value)}
                    className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Özel Fire %</label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    placeholder="Var."
                    value={recipeWasteOverride}
                    onChange={(e) => setRecipeWasteOverride(e.target.value)}
                    className="w-full bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!recipeRawMaterialId}
                  className="sm:col-span-2 w-full py-1.5 bg-emerald-600 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors flex justify-center cursor-pointer"
                >
                  <Plus size={16} />
                </button>
              </form>

              {/* Recipe Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase">
                      <th className="py-2">Hammadde</th>
                      <th className="py-2 text-right">Miktar (1 Pkt)</th>
                      <th className="py-2 text-right">Fire Oranı %</th>
                      <th className="py-2 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-slate-600">
                    {recipeDetails.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-10 text-slate-400 bg-white font-medium">
                          Reçete boş. Lütfen yukarıdan hammadde ekleyin.
                        </td>
                      </tr>
                    ) : (
                      recipeDetails.items.map(({ recipe, rawMaterial, displayQuantity, displayUnit }) => (
                        <tr key={recipe.id}>
                          <td className="py-2.5 font-semibold text-slate-800">
                            {rawMaterial?.name} <span className="text-[10px] font-medium text-slate-400">({rawMaterial?.category})</span>
                          </td>
                          <td className="py-2.5 text-right font-medium">
                            {formatWeight(displayQuantity, displayUnit as any)}
                          </td>
                          <td className="py-2.5 text-right text-slate-500">
                            {recipe.wasteRateOverride !== undefined ? (
                              <span className="text-emerald-600 font-semibold" title="Özel Reçete Overrides">
                                %{recipe.wasteRateOverride} (Özel)
                              </span>
                            ) : (
                              <span>%{rawMaterial?.defaultWasteRate} (Kart)</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => handleDeleteRecipeItem(recipe.id)}
                              className="p-1 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50"
                              title="Sil"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. AUTOMATIC CALCULATION PREVIEW (5 columns) */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-xs lg:col-span-5 space-y-4">
              <div className="flex items-center gap-1.5 border-b border-slate-200 pb-3">
                <Calculator className="text-emerald-600" size={16} />
                <h3 className="text-sm font-bold text-slate-800">Hesaplama Ön İzleme Motoru</h3>
              </div>

              {/* Input for interactive test */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Sipariş Hacmi Simülasyonu (Paket Adedi)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={testQuantity}
                    onChange={(e) => setTestQuantity(parseInt(e.target.value) || 1)}
                    className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 font-bold focus:outline-none flex-1"
                  />
                  <div className="bg-slate-200/60 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center">
                    Paket
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Gireceğiniz test adetine göre üretim girdileri anında hesaplanır.</p>
              </div>

              {preview && (
                <div className="space-y-4 pt-2">
                  {/* Summary grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/50 shadow-xs">
                      <p className="text-slate-400 text-[10px] uppercase font-semibold">Toplam Ciro</p>
                      <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(preview.revenue)}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/50 shadow-xs">
                      <p className="text-slate-400 text-[10px] uppercase font-semibold">Toplam Maliyet</p>
                      <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(preview.totalCost)}</p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/50 shadow-xs">
                      <p className="text-slate-400 text-[10px] uppercase font-semibold">Net Kâr Tutarı</p>
                      <p className={`font-extrabold mt-0.5 ${preview.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(preview.profit)}
                      </p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/50 shadow-xs">
                      <p className="text-slate-400 text-[10px] uppercase font-semibold">Kâr Marjı %</p>
                      <p className={`font-extrabold mt-0.5 ${preview.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        %{preview.margin.toFixed(1)}
                      </p>
                    </div>
                  </div>

                  {/* Material Girds Breakdown list */}
                  <div className="space-y-2 pt-2">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Hammadde Gereksinimleri</h4>
                    
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {preview.items.length === 0 ? (
                        <p className="text-xs text-slate-400 italic text-center py-4">Reçetede malzeme bulunmadığı için hesaplama yapılamadı.</p>
                      ) : (
                        preview.items.map((item: any, i: number) => (
                          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200/50 shadow-xs space-y-2 text-xs">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                              <span className="font-bold text-slate-800">{item.rawMaterialName}</span>
                              <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md">
                                Fire: %{item.wasteRate}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-600 text-[11px]">
                              <div>Net Temiz İhtiyaç:</div>
                              <div className="text-right font-medium text-slate-800">{formatWeight(item.netReq, item.unit)}</div>
                              
                              <div>Güvenlik Paylı İhtiyaç:</div>
                              <div className="text-right font-medium text-slate-800">{formatWeight(item.safetyAdj, item.unit)}</div>

                              <div className="text-emerald-600 font-semibold">Gerekli Ham (Brüt):</div>
                              <div className="text-right font-bold text-emerald-700">{formatWeight(item.grossReq, item.unit)}</div>

                              <div className="text-amber-600 font-semibold">Tahmini Fire:</div>
                              <div className="text-right font-bold text-amber-600">{formatWeight(item.estWaste, item.unit)}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Packet base costs */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200/50 shadow-xs space-y-2 text-xs">
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1.5">Paket Başı Özet Analiz</h4>
                    <div className="grid grid-cols-2 gap-y-1 text-slate-600 text-[11px]">
                      <div>Hammadde Maliyeti:</div>
                      <div className="text-right font-medium text-slate-800">{formatCurrency(preview.costBreakdown.rawMaterialCost)}</div>
                      
                      <div>Ambalaj Maliyeti:</div>
                      <div className="text-right font-medium text-slate-800">{formatCurrency(preview.costBreakdown.packagingCost)}</div>

                      <div>İşçilik + Genel Giderler:</div>
                      <div className="text-right font-medium text-slate-800">{formatCurrency(preview.costBreakdown.laborCost + preview.costBreakdown.overheadCost)}</div>

                      <div className="border-t border-slate-100 pt-1 text-slate-800 font-bold">Toplam Maliyet/Paket:</div>
                      <div className="border-t border-slate-100 pt-1 text-right font-bold text-slate-950">{formatCurrency(preview.costBreakdown.totalCostPerPackage)}</div>

                      <div className="text-emerald-600 font-bold">Kâr/Paket:</div>
                      <div className="text-right font-bold text-emerald-600">{formatCurrency(preview.costBreakdown.profitPerPackage)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* PRODUCT CATALOG LIST VIEW */
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Ürün adı veya kategorisine göre ara..."
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
              {productCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Products grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((p) => {
              const recItems = recipes.filter(r => r.productId === p.id);
              const costBreakdown = calculateProductCost(p, recipes, rawMaterials, costSettings, stockMovements);

              return (
                <div
                  key={p.id}
                  onClick={() => setDetailProduct(p)}
                  className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs hover:border-emerald-200 cursor-pointer group transition-all flex flex-col justify-between hover:shadow-md"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700">
                        {p.category}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${p.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                        {p.isActive ? 'Aktif' : 'Pasif'}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">{p.name}</h3>
                    
                    <div className="flex gap-2 text-[10px] text-slate-400 items-center flex-wrap">
                      <span>Gramaj: {p.packageWeightGrams} g</span>
                      <span>•</span>
                      <span>Reçete: {recItems.length} Girdi</span>
                      <span>•</span>
                      {p.lotPrefix ? (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                          Parti Kodu: {p.lotPrefix}
                        </span>
                      ) : (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold text-[10px]">
                          Parti Kodu Tanımsız
                        </span>
                      )}
                    </div>

                    {/* Quick cost visual */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/60 mt-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-[10px]">Maliyet / Pkt:</span>
                        <span className="font-semibold text-slate-700">{formatCurrency(costBreakdown.totalCostPerPackage)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-[10px]">Satış Fiyatı:</span>
                        <span className="font-bold text-slate-800">{formatCurrency(p.salePrice)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-100 pt-1">
                        <span className="text-slate-400 text-[10px]">Paket Başı Kâr:</span>
                        <span className="font-extrabold text-emerald-600">{formatCurrency(costBreakdown.profitPerPackage)} (%{costBreakdown.profitMarginPercent.toFixed(1)})</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-50 text-xs">
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      Reçete ve Hesaplamalar <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                    <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleOpenEditProduct(p, e)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Ürünü Düzenle"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteProduct(p.id, e)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Sil"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ADD/EDIT PRODUCT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{editingProduct ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}</h3>
              <button onClick={() => setIsProductModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Ürün Adı *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: 250 g Meyve Mix"
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Kategori *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ProductCategory)}
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none"
                  >
                    {productCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Paket Gramajı *</label>
                  <input
                    type="text"
                    required
                    value={packageWeightGrams}
                    onChange={(e) => setPackageWeightGrams(e.target.value)}
                    placeholder="Gramaj cinsinden"
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Satış Fiyatı (TL) *</label>
                  <input
                    type="text"
                    required
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    placeholder="Örn: 35.00"
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Güvenlik Payı % *</label>
                  <input
                    type="text"
                    required
                    value={defaultSafetyRate}
                    onChange={(e) => setDefaultSafetyRate(e.target.value)}
                    placeholder="Örn: 3"
                    className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Parti Ön Kodu</label>
                <input
                  type="text"
                  maxLength={3}
                  value={lotPrefix}
                  onChange={(e) => handleLotPrefixChange(e.target.value)}
                  placeholder="Örn. ANS"
                  className="w-full bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Bu ürün üretildiğinde otomatik parti numarası için kullanılacak 3 karakterlik koddur. Örnek: XXX-GGAAYY</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="prodIsActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="prodIsActive" className="text-xs font-semibold text-slate-600 cursor-pointer">
                  Ürün Satışa Aktif
                </label>
              </div>

              <div className="flex justify-end gap-2.5 border-t border-slate-50 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 cursor-pointer"
                >
                  {editingProduct ? 'Kaydet' : 'Oluştur ve Reçete Yap'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
