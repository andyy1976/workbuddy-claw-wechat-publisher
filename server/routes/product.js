/**
 * 产品数据路由
 * GET  /api/product/list        - 产品列表
 * GET  /api/product/:id          - 产品详情（含BOM/工艺/质量）
 * POST /api/product/save         - 保存产品数据
 * GET  /api/product/bom          - BOM物料库
 * GET  /api/product/processes    - 工艺库
 * GET  /api/product/quality      - 质量标准库
 */

const express = require('express');
const router = express.Router();
const productSvc = require('../services/product');

router.get('/list', (req, res) => {
    const products = productSvc.listProducts();
    res.json({ success: true, data: products });
});

// Full data endpoint for dashboard (bom + processes + quality + advantages)
router.get('/__all__', (req, res) => {
    const data = productSvc.getFullProductData();
    const advantages = productSvc.generateAdvantages(data.bom, data.processes, data.quality);
    res.json({
        success: true,
        data: { ...data, advantages }
    });
});

router.get('/:id', (req, res) => {
    const data = productSvc.getFullProductData(req.params.id);
    res.json({ success: true, data });
});

router.post('/save', (req, res) => {
    const { productId, data } = req.body;
    if (!productId || !data) {
        return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = productSvc.saveProductData(productId, data);
    res.json({ success: true, data: result });
});

router.get('/bom/library', (req, res) => {
    const data = productSvc.getFullProductData();
    res.json({ success: true, data: data.bom });
});

router.get('/processes/library', (req, res) => {
    const data = productSvc.getFullProductData();
    res.json({ success: true, data: data.processes });
});

router.get('/quality/library', (req, res) => {
    const data = productSvc.getFullProductData();
    res.json({ success: true, data: data.quality });
});

module.exports = router;
