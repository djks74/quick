<?php
namespace Gercep\Sync\Observer;

use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\Event\Observer;

class ProductSaveAfter implements ObserverInterface
{
    public function execute(Observer $observer)
    {
        $product = $observer->getEvent()->getProduct();
        
        // Basic Sync Logic
        $url = 'https://gercep.click/api/partner/sync-products';
        $apiKey = 'YOUR_API_KEY'; // This should be a configuration setting in Magento

        $data = [
            'action' => 'upsert',
            'products' => [[
                'externalId' => (string)$product->getId(),
                'name' => $product->getName(),
                'price' => (float)$product->getPrice(),
                'category' => 'Magento Product',
                'description' => $product->getShortDescription(),
                'stock' => (int)$product->getQuantityAndStockStatus()['qty'] ?? 999
            ]]
        ];

        // Send via cURL or Magento HTTP Client
    }
}
