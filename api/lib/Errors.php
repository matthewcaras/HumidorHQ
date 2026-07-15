<?php
declare(strict_types=1);
/*
 * Filename: Errors.php
 * Revision: 1.0.0
 * Description: PHP application source file for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-15 00:13 ET
 */

class ApiError extends RuntimeException
{
    public string $codeName;
    public int $statusCode;

    public function __construct(string $codeName, string $message, int $statusCode = 400)
    {
        parent::__construct($message);
        $this->codeName = $codeName;
        $this->statusCode = $statusCode;
    }
}


