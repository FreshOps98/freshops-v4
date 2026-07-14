import { localDataService } from './localDataService';
import { supabaseDataService, resetAllFreshOpsData } from './supabaseDataService';
import {
  Customer,
  RawMaterial,
  Product,
  ProductRecipeItem,
  StockMovement,
  Order,
  OrderItem,
  ProductionPlan,
  ProductionPlanItem,
  FinishedGoodsStock,
  WasteRecord,
  CostSettings,
  CloseProductionPlanAction
} from '../types';

// Central configuration flag. Keep this true to activate Supabase.
export const USE_SUPABASE = true;

// Re-export constants and helpers for full backward compatibility
export { generateId, calculateCurrentStock, KEYS } from './localDataService';

/**
 * CENTRAL DATA SERVICE ORCHESTRATOR
 * 
 * Bu servis, uygulamanın veri taleplerini karşılayan ana API katmanıdır.
 * "USE_SUPABASE" bayrağına göre istekleri localDataService (localStorage)
 * veya supabaseDataService (Supabase) katmanına yönlendirir.
 * 
 * Bu aşamada (Phase 2B) USE_SUPABASE true olarak ayarlanmıştır. Yazma (save) işlemleri
 * hem localDataService'e (yedek/fallback/hızlı önbellek) hem de asenkron olarak 
 * Supabase veritabanına yapılır.
 */
export const dataService = {
  init() {
    localDataService.init();
  },

  async resetAllData() {
    if (USE_SUPABASE) {
      return await resetAllFreshOpsData();
    } else {
      return localDataService.resetAllData();
    }
  },

  clearDemoData() {
    localDataService.clearDemoData();
  },

  // --- CUSTOMERS ---
  getCustomers(): Customer[] {
    return localDataService.getCustomers();
  },
  saveCustomers(customers: Customer[]) {
    localDataService.saveCustomers(customers);
    // Suppress automatic background bulk saving to Supabase
  },
  addCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Customer {
    return localDataService.addCustomer(customer);
  },
  async addCleanCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Customer> {
    if (USE_SUPABASE) {
      return await supabaseDataService.addCustomer(customer);
    } else {
      return localDataService.addCustomer(customer);
    }
  },
  updateCustomer(id: string, updates: Partial<Customer>): Customer {
    return localDataService.updateCustomer(id, updates);
  },
  async updateCleanCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    if (USE_SUPABASE) {
      return await supabaseDataService.updateCustomer(id, updates);
    } else {
      return localDataService.updateCustomer(id, updates);
    }
  },
  deleteCustomer(id: string) {
    localDataService.deleteCustomer(id);
  },
  async deleteCleanCustomer(id: string): Promise<void> {
    localDataService.deleteCustomer(id);
    if (USE_SUPABASE) {
      await supabaseDataService.deleteCustomer(id);
    }
  },

  // --- RAW MATERIALS ---
  getRawMaterials(): RawMaterial[] {
    return localDataService.getRawMaterials();
  },
  saveRawMaterials(list: RawMaterial[]) {
    localDataService.saveRawMaterials(list);
    // Suppress automatic background bulk saving to Supabase
  },
  addRawMaterial(rm: Omit<RawMaterial, 'id' | 'createdAt' | 'updatedAt'>): RawMaterial {
    return localDataService.addRawMaterial(rm);
  },
  async addCleanRawMaterial(rm: Omit<RawMaterial, 'id' | 'createdAt' | 'updatedAt'>): Promise<RawMaterial> {
    if (USE_SUPABASE) {
      return await supabaseDataService.addRawMaterial(rm);
    } else {
      return localDataService.addRawMaterial(rm);
    }
  },
  updateRawMaterial(id: string, updates: Partial<RawMaterial>): RawMaterial {
    return localDataService.updateRawMaterial(id, updates);
  },
  async updateCleanRawMaterial(id: string, updates: Partial<RawMaterial>): Promise<RawMaterial> {
    if (USE_SUPABASE) {
      return await supabaseDataService.updateRawMaterial(id, updates);
    } else {
      return localDataService.updateRawMaterial(id, updates);
    }
  },
  deleteRawMaterial(id: string) {
    localDataService.deleteRawMaterial(id);
  },
  async deleteCleanRawMaterial(id: string): Promise<void> {
    localDataService.deleteRawMaterial(id);
    if (USE_SUPABASE) {
      await supabaseDataService.deleteRawMaterial(id);
    }
  },

  // --- PRODUCTS ---
  getProducts(): Product[] {
    return localDataService.getProducts();
  },
  saveProducts(list: Product[]) {
    localDataService.saveProducts(list);
    // Suppress automatic background bulk saving to Supabase
  },
  addProduct(prod: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product {
    return localDataService.addProduct(prod);
  },
  async addCleanProduct(prod: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    if (USE_SUPABASE) {
      return await supabaseDataService.addProduct(prod);
    } else {
      return localDataService.addProduct(prod);
    }
  },
  updateProduct(id: string, updates: Partial<Product>): Product {
    return localDataService.updateProduct(id, updates);
  },
  async updateCleanProduct(id: string, updates: Partial<Product>): Promise<Product> {
    if (USE_SUPABASE) {
      return await supabaseDataService.updateProduct(id, updates);
    } else {
      return localDataService.updateProduct(id, updates);
    }
  },
  deleteProduct(id: string) {
    localDataService.deleteProduct(id);
  },
  async deleteCleanProduct(id: string): Promise<void> {
    localDataService.deleteProduct(id);
    if (USE_SUPABASE) {
      await supabaseDataService.deleteProduct(id);
    }
  },

  // --- RECIPES ---
  getRecipes(): ProductRecipeItem[] {
    return localDataService.getRecipes();
  },
  saveRecipes(list: ProductRecipeItem[]) {
    localDataService.saveRecipes(list);
    // Suppress automatic background bulk saving to Supabase
  },
  addRecipeItem(item: Omit<ProductRecipeItem, 'id'>): ProductRecipeItem {
    return localDataService.addRecipeItem(item);
  },
  async addCleanRecipeItem(item: Omit<ProductRecipeItem, 'id'>): Promise<ProductRecipeItem> {
    if (USE_SUPABASE) {
      return await supabaseDataService.addRecipeItem(item);
    } else {
      return localDataService.addRecipeItem(item);
    }
  },
  updateRecipeItem(id: string, updates: Partial<ProductRecipeItem>): ProductRecipeItem {
    return localDataService.updateRecipeItem(id, updates);
  },
  async updateCleanRecipeItem(id: string, updates: Partial<ProductRecipeItem>): Promise<ProductRecipeItem> {
    if (USE_SUPABASE) {
      return await supabaseDataService.updateRecipeItem(id, updates);
    } else {
      return localDataService.updateRecipeItem(id, updates);
    }
  },
  deleteRecipeItem(id: string) {
    localDataService.deleteRecipeItem(id);
  },
  async deleteCleanRecipeItem(id: string): Promise<void> {
    localDataService.deleteRecipeItem(id);
    if (USE_SUPABASE) {
      await supabaseDataService.deleteRecipeItem(id);
    }
  },

  // --- STOCK MOVEMENTS ---
  getStockMovements(): StockMovement[] {
    return localDataService.getStockMovements();
  },
  saveStockMovements(list: StockMovement[]) {
    localDataService.saveStockMovements(list);
    // Suppress automatic background bulk saving to Supabase
  },
  addStockMovement(mov: Omit<StockMovement, 'id' | 'createdAt'>): StockMovement {
    return localDataService.addStockMovement(mov);
  },
  async addCleanStockMovement(mov: Omit<StockMovement, 'id' | 'createdAt'>): Promise<StockMovement> {
    if (USE_SUPABASE) {
      return await supabaseDataService.addStockMovement(mov);
    } else {
      return localDataService.addStockMovement(mov);
    }
  },
  updateStockMovement(id: string, updates: Partial<StockMovement>): StockMovement {
    return localDataService.updateStockMovement(id, updates);
  },
  async updateCleanStockMovement(id: string, updates: Partial<StockMovement>): Promise<StockMovement> {
    if (USE_SUPABASE) {
      return await supabaseDataService.updateStockMovement(id, updates);
    } else {
      return localDataService.updateStockMovement(id, updates);
    }
  },
  deleteStockMovement(id: string) {
    localDataService.deleteStockMovement(id);
  },
  async deleteCleanStockMovement(id: string): Promise<void> {
    localDataService.deleteStockMovement(id);
    if (USE_SUPABASE) {
      await supabaseDataService.deleteStockMovement(id);
    }
  },

  getCurrentStocks(): Record<string, number> {
    return localDataService.getCurrentStocks();
  },

  // --- ORDERS ---
  getOrders(): Order[] {
    return localDataService.getOrders();
  },
  saveOrders(list: Order[]) {
    localDataService.saveOrders(list);
    // Suppress automatic background bulk saving to Supabase
  },
  addOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<OrderItem, 'id' | 'orderId'>[]): Order {
    return localDataService.addOrder(order, items);
  },
  async addCleanOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<OrderItem, 'id' | 'orderId'>[]): Promise<Order> {
    if (USE_SUPABASE) {
      return await supabaseDataService.addOrder(order, items);
    } else {
      return localDataService.addOrder(order, items);
    }
  },
  updateOrder(id: string, updates: Partial<Order>, items?: OrderItem[]): Order {
    return localDataService.updateOrder(id, updates, items);
  },
  async updateCleanOrder(id: string, updates: Partial<Order>, items?: OrderItem[]): Promise<Order> {
    if (USE_SUPABASE) {
      return await supabaseDataService.updateOrder(id, updates, items);
    } else {
      return localDataService.updateOrder(id, updates, items);
    }
  },
  deleteOrder(id: string) {
    localDataService.deleteOrder(id);
  },
  async deleteCleanOrder(id: string): Promise<void> {
    localDataService.deleteOrder(id);
    if (USE_SUPABASE) {
      await supabaseDataService.deleteOrder(id);
    }
  },

  // --- ORDER ITEMS ---
  getOrderItems(): OrderItem[] {
    return localDataService.getOrderItems();
  },
  saveOrderItems(list: OrderItem[]) {
    localDataService.saveOrderItems(list);
    // Suppress automatic background bulk saving to Supabase
  },

  // --- PRODUCTION PLANS ---
  getProductionPlans(): ProductionPlan[] {
    return localDataService.getProductionPlans();
  },
  saveProductionPlans(list: ProductionPlan[]) {
    localDataService.saveProductionPlans(list);
    // Suppress automatic background bulk saving to Supabase
  },
  addProductionPlan(plan: Omit<ProductionPlan, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<ProductionPlanItem, 'id' | 'productionPlanId'>[]): ProductionPlan {
    return localDataService.addProductionPlan(plan, items);
  },
  async addCleanProductionPlan(plan: Omit<ProductionPlan, 'id' | 'createdAt' | 'updatedAt'>, items: Omit<ProductionPlanItem, 'id' | 'productionPlanId'>[]): Promise<ProductionPlan> {
    if (USE_SUPABASE) {
      return await supabaseDataService.addProductionPlan(plan, items);
    } else {
      return localDataService.addProductionPlan(plan, items);
    }
  },
  updateProductionPlan(id: string, updates: Partial<ProductionPlan>, items?: ProductionPlanItem[]): ProductionPlan {
    return localDataService.updateProductionPlan(id, updates, items);
  },
  async updateCleanProductionPlan(id: string, updates: Partial<ProductionPlan>, items?: ProductionPlanItem[]): Promise<ProductionPlan> {
    if (USE_SUPABASE) {
      return await supabaseDataService.updateProductionPlan(id, updates, items);
    } else {
      return localDataService.updateProductionPlan(id, updates, items);
    }
  },
  async addOrderItemToProductionPlan(
    productionPlanId: string,
    orderId: string,
    orderItemId: string,
    productId: string,
    plannedQuantity: number,
    unit: string = 'Adet'
  ): Promise<any> {
    if (USE_SUPABASE) {
      return await supabaseDataService.addOrderItemToProductionPlan(
        productionPlanId,
        orderId,
        orderItemId,
        productId,
        plannedQuantity,
        unit
      );
    } else {
      const plan = localDataService.getProductionPlans().find(p => p.id === productionPlanId);
      if (!plan) throw new Error("Plan not found");
      const existingItems = localDataService.getProductionPlanItems().filter(i => i.productionPlanId === productionPlanId);
      const existing = existingItems.find(i => i.orderItemId === orderItemId && !i.isDeleted);
      
      let updatedItems = [...existingItems];
      if (existing) {
        existing.plannedQuantity += plannedQuantity;
      } else {
        const order = localDataService.getOrders().find(o => o.id === orderId);
        const newItem = {
          id: 'ppi_' + Math.random().toString(36).substring(2, 9),
          productionPlanId,
          orderId,
          orderItemId,
          customerId: order?.customerId || '',
          productId,
          plannedQuantity,
          producedQuantity: 0,
          status: 'Planlandı' as any,
          note: '',
          rawMaterialsDeducted: false,
          finishedGoodsCreated: false
        };
        updatedItems.push(newItem);
      }
      localDataService.updateProductionPlan(productionPlanId, {}, updatedItems);
      return { success: true };
    }
  },
  deleteProductionPlan(id: string) {
    localDataService.deleteProductionPlan(id);
  },
  async deleteCleanProductionPlan(id: string): Promise<void> {
    localDataService.deleteProductionPlan(id);
    if (USE_SUPABASE) {
      await supabaseDataService.deleteProductionPlan(id);
    }
  },

  async closeProductionPlanAndCarryOver(
    sourcePlanId: string,
    actions: CloseProductionPlanAction[]
  ): Promise<any> {
    if (USE_SUPABASE) {
      return await supabaseDataService.closeProductionPlanAndCarryOverAtomic(sourcePlanId, actions);
    } else {
      return await this.simulateLocalCloseAndCarryOver(sourcePlanId, actions);
    }
  },

  async simulateLocalCloseAndCarryOver(
    sourcePlanId: string,
    actions: CloseProductionPlanAction[]
  ): Promise<any> {
    const plans = localDataService.getProductionPlans();
    const planItems = localDataService.getProductionPlanItems();
    
    const sourcePlan = plans.find(p => p.id === sourcePlanId);
    if (!sourcePlan) throw new Error("Kaynak plan bulunamadı");
    
    const sourceItems = planItems.filter(item => item.productionPlanId === sourcePlanId);

    let totalShortage = 0;
    sourceItems.forEach(item => {
      const produced = item.producedQuantity || 0;
      const shortage = Math.max(0, item.plannedQuantity - produced);
      totalShortage += shortage;
    });

    if (totalShortage === 0) {
      sourcePlan.status = 'Tamamlandı';
      sourcePlan.completedAt = new Date().toISOString();
      (sourcePlan as any).closedWithShortage = false;

      sourceItems.forEach(item => {
        item.status = 'Tamamlandı';
      });
    } else {
      sourcePlan.status = 'Eksikle Kapatıldı';
      sourcePlan.closedAt = new Date().toISOString();
      (sourcePlan as any).closedWithShortage = true;

      sourceItems.forEach(item => {
        const produced = item.producedQuantity || 0;
        const shortage = item.plannedQuantity - produced;
        if (shortage > 0) {
          item.status = 'Eksikle Kapatıldı';
        } else {
          item.status = 'Tamamlandı';
        }
      });
    }
    
    for (const act of actions) {
      const sourceItem = sourceItems.find(item => item.id === act.planItemId);
      if (!sourceItem) continue;
      
      if (act.action === 'close_without_carry') {
        sourceItem.status = 'Eksikle Kapatıldı';
        continue;
      }

      const missingQty = sourceItem.plannedQuantity - sourceItem.producedQuantity;
      if (missingQty <= 0) continue;
      
      let targetPlanDate = '';
      if (act.action === 'carry_tomorrow') {
        const dateObj = new Date(sourcePlan.productionDate);
        dateObj.setDate(dateObj.getDate() + 1);
        targetPlanDate = dateObj.toISOString().split('T')[0];
      } else if (act.action === 'carry_date' && act.targetDate) {
        targetPlanDate = act.targetDate;
      }
      
      if (targetPlanDate) {
        let targetPlan = plans.find(p => p.productionDate === targetPlanDate);
        if (!targetPlan) {
          const targetPlanId = 'plan_' + Math.random().toString(36).substring(2, 9);
          targetPlan = {
            id: targetPlanId,
            productionDate: targetPlanDate,
            status: 'Planlandı',
            note: 'Devredilen üretim planı',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          plans.push(targetPlan);
        }
        
        const newItem: ProductionPlanItem = {
          id: 'ppi_' + Math.random().toString(36).substring(2, 9),
          productionPlanId: targetPlan.id,
          orderId: sourceItem.orderId,
          orderItemId: sourceItem.orderItemId,
          customerId: sourceItem.customerId,
          productId: sourceItem.productId,
          plannedQuantity: missingQty,
          producedQuantity: 0,
          status: 'Planlandı',
          note: sourceItem.note || '',
          isCarryOver: true,
          sourceCarryOverFromPlanId: sourcePlan.id,
          sourceCarryOverFromPlanItemId: sourceItem.id,
          carryOverReason: "Eksik üretim devri (Yerel Simülasyon)",
          carryOverCreatedAt: new Date().toISOString(),
          carryOverQuantityTotal: missingQty,
          carryOverSources: [
            {
              planId: sourcePlan.id,
              planItemId: sourceItem.id,
              quantity: missingQty,
              date: sourcePlan.productionDate
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        planItems.push(newItem);
      }
    }
    
    localDataService.saveProductionPlans(plans);
    localDataService.saveProductionPlanItems(planItems);
    
    return { success: true };
  },

  getProductionPlanItems(): ProductionPlanItem[] {
    return localDataService.getProductionPlanItems();
  },
  saveProductionPlanItems(list: ProductionPlanItem[]) {
    localDataService.saveProductionPlanItems(list);
    // Suppress automatic background bulk saving to Supabase
  },

  // --- FINISHED GOODS ---
  getFinishedGoods(): FinishedGoodsStock[] {
    return localDataService.getFinishedGoods();
  },
  saveFinishedGoods(list: FinishedGoodsStock[]) {
    localDataService.saveFinishedGoods(list);
    // Suppress automatic background bulk saving to Supabase
  },
  addFinishedGood(item: Omit<FinishedGoodsStock, 'id' | 'createdAt' | 'updatedAt'>): FinishedGoodsStock {
    return localDataService.addFinishedGood(item);
  },
  async addCleanFinishedGood(item: Omit<FinishedGoodsStock, 'id' | 'createdAt' | 'updatedAt'>): Promise<FinishedGoodsStock> {
    if (USE_SUPABASE) {
      return await supabaseDataService.addFinishedGood(item);
    } else {
      return localDataService.addFinishedGood(item);
    }
  },
  updateFinishedGood(id: string, updates: Partial<FinishedGoodsStock>): FinishedGoodsStock {
    return localDataService.updateFinishedGood(id, updates);
  },
  async updateCleanFinishedGood(id: string, updates: Partial<FinishedGoodsStock>): Promise<FinishedGoodsStock> {
    if (USE_SUPABASE) {
      return await supabaseDataService.updateFinishedGood(id, updates);
    } else {
      return localDataService.updateFinishedGood(id, updates);
    }
  },
  deleteFinishedGood(id: string) {
    localDataService.deleteFinishedGood(id);
  },
  async deleteCleanFinishedGood(id: string): Promise<void> {
    localDataService.deleteFinishedGood(id);
    if (USE_SUPABASE) {
      await supabaseDataService.deleteFinishedGood(id);
    }
  },

  // --- WASTE RECORDS ---
  getWasteRecords(): WasteRecord[] {
    return localDataService.getWasteRecords();
  },
  saveWasteRecords(list: WasteRecord[]) {
    localDataService.saveWasteRecords(list);
    // Suppress automatic background bulk saving to Supabase
  },
  addWasteRecord(rec: Omit<WasteRecord, 'id' | 'wasteRate' | 'yieldRate'>): WasteRecord {
    return localDataService.addWasteRecord(rec);
  },
  async addCleanWasteRecord(rec: Omit<WasteRecord, 'id' | 'wasteRate' | 'yieldRate'>): Promise<WasteRecord> {
    if (USE_SUPABASE) {
      return await supabaseDataService.addWasteRecord(rec);
    } else {
      return localDataService.addWasteRecord(rec);
    }
  },
  deleteWasteRecord(id: string) {
    localDataService.deleteWasteRecord(id);
  },
  async deleteCleanWasteRecord(id: string): Promise<void> {
    localDataService.deleteWasteRecord(id);
    if (USE_SUPABASE) {
      await supabaseDataService.deleteWasteRecord(id);
    }
  },

  // --- FINISHED GOODS MOVEMENTS ---
  getFinishedGoodsMovements(): any[] {
    return localDataService.getFinishedGoodsMovements();
  },
  saveFinishedGoodsMovements(list: any[]) {
    localDataService.saveFinishedGoodsMovements(list);
    // Suppress automatic background bulk saving to Supabase
  },

  // --- COST SETTINGS ---
  getCostSettings(): CostSettings {
    return localDataService.getCostSettings();
  },
  saveCostSettings(settings: CostSettings) {
    localDataService.saveCostSettings(settings);
    // Suppress automatic background bulk saving to Supabase
  },
  async saveCleanCostSettings(settings: CostSettings): Promise<void> {
    localDataService.saveCostSettings(settings);
    if (USE_SUPABASE) {
      await supabaseDataService.saveCostSettings(settings);
    }
  },

  // --- PRODUCTION RUNS ---
  getProductionRuns(): any[] {
    return localDataService.getProductionRuns();
  },
  saveProductionRuns(runs: any[]) {
    localDataService.saveProductionRuns(runs);
    // Suppress automatic background bulk saving to Supabase
  }
};

export { supabaseDataService };
