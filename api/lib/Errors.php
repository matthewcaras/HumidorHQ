<?php
declare(strict_types=1);

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
