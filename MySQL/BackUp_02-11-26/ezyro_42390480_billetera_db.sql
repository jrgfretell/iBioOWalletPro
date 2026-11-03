-- phpMyAdmin SQL Dump
-- version 4.9.0.1
-- https://www.phpmyadmin.net/
--
-- Servidor: sql303.byetcluster.com
-- Tiempo de generación: 02-11-2026 a las 15:39:40
-- Versión del servidor: 11.4.13-MariaDB
-- Versión de PHP: 7.2.22

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `ezyro_42390480_billetera_db`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `categorias`
--

CREATE TABLE `categorias` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `color` varchar(7) NOT NULL DEFAULT '#3498db',
  `icono` varchar(50) NOT NULL DEFAULT 'fa-folder',
  `creado_el` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `categorias`
--

INSERT INTO `categorias` (`id`, `nombre`, `color`, `icono`, `creado_el`) VALUES
(6, 'Otros', '#7f8c8d', 'fa-ellipsis-h', '2026-07-14 19:18:50'),
(10, 'Préstamos', '#6c5ce7', 'fa-hand-holding-dollar', '2026-08-06 17:08:27'),
(11, 'Catalina', '#2ecc71', 'fa-heart', '2026-08-06 17:13:33'),
(12, 'Salud', '#74b9ff', 'fa-stethoscope', '2026-08-06 18:01:35'),
(13, 'Servicios', '#1e3799', 'fa-plug', '2026-08-06 18:02:41'),
(14, 'Alquileres', '#fdcb6e', 'fa-key', '2026-08-06 18:03:58'),
(15, 'Comida', '#ff7675', 'fa-utensils', '2026-08-07 17:46:40');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `config_billetera`
--

CREATE TABLE `config_billetera` (
  `id` int(11) NOT NULL,
  `monto_base` decimal(10,2) NOT NULL DEFAULT 1000.00,
  `actualizado_el` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `config_billetera`
--

INSERT INTO `config_billetera` (`id`, `monto_base`, `actualizado_el`) VALUES
(1, '0.00', '2026-08-06 06:38:22');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `movimientos_agenda`
--

CREATE TABLE `movimientos_agenda` (
  `id` int(11) NOT NULL,
  `tipo` enum('gasto','ingreso') NOT NULL,
  `descripcion` varchar(255) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `fecha` date NOT NULL,
  `categoria_id` int(11) DEFAULT NULL,
  `es_recurrente` tinyint(1) DEFAULT 0,
  `recurrente_id` int(11) DEFAULT NULL,
  `creado_el` timestamp NULL DEFAULT current_timestamp()
) ;

--
-- Volcado de datos para la tabla `movimientos_agenda`
--

INSERT INTO `movimientos_agenda` (`id`, `tipo`, `descripcion`, `monto`, `fecha`, `categoria_id`, `es_recurrente`, `recurrente_id`, `creado_el`) VALUES
(214, 'gasto', 'Seguro Mamá', '120.00', '2026-07-15', 6, 1, NULL, '2026-07-16 00:20:07'),
(227, 'gasto', 'Departamento', '975.00', '2026-07-15', 6, 1, NULL, '2026-07-16 00:46:40'),
(240, 'gasto', 'Win', '119.00', '2026-07-30', 6, 1, NULL, '2026-07-16 00:49:05'),
(253, 'gasto', 'Entel', '38.00', '2026-07-30', 6, 1, NULL, '2026-07-16 00:49:19'),
(266, 'gasto', 'Movilidad Catalina', '150.00', '2026-07-30', 6, 1, NULL, '2026-07-16 00:49:47'),
(272, 'gasto', 'Colegio Catalina', '351.00', '2026-07-30', 6, 1, NULL, '2026-07-16 00:50:17'),
(278, 'gasto', 'Ronald 8000', '250.00', '2026-07-30', 6, 1, NULL, '2026-07-16 00:51:44'),
(291, 'gasto', 'Ronald 1800', '187.00', '2026-07-30', 6, 1, NULL, '2026-07-16 00:53:06'),
(297, 'gasto', 'Ronald 2500', '246.00', '2026-07-30', 6, 1, NULL, '2026-07-16 00:54:14'),
(493, 'gasto', 'Ronald 1800', '187.00', '2026-08-30', 10, 1, NULL, '2026-08-06 17:08:50'),
(494, 'gasto', 'Ronald 1800', '187.00', '2026-09-30', 10, 1, NULL, '2026-08-06 17:08:50'),
(495, 'gasto', 'Ronald 1800', '187.00', '2026-10-30', 10, 1, NULL, '2026-08-06 17:08:50'),
(498, 'gasto', 'Ronald 2500', '246.00', '2026-08-30', 10, 1, NULL, '2026-08-06 17:08:57'),
(499, 'gasto', 'Cibertec Ronald', '505.00', '2026-09-30', 10, 1, NULL, '2026-08-06 17:09:15'),
(500, 'gasto', 'Cibertec Ronald', '505.00', '2026-10-30', 10, 1, NULL, '2026-08-06 17:09:15'),
(516, 'gasto', 'Movilidad Catalina', '150.00', '2026-08-30', 11, 1, NULL, '2026-08-06 17:13:45'),
(517, 'gasto', 'Movilidad Catalina', '150.00', '2026-09-30', 11, 1, NULL, '2026-08-06 17:13:45'),
(518, 'gasto', 'Movilidad Catalina', '150.00', '2026-10-30', 11, 1, NULL, '2026-08-06 17:13:45'),
(521, 'gasto', 'Colegio Catalina', '351.00', '2026-08-30', 11, 1, NULL, '2026-08-06 17:13:52'),
(522, 'gasto', 'Colegio Catalina', '351.00', '2026-09-30', 11, 1, NULL, '2026-08-06 17:13:52'),
(523, 'gasto', 'Colegio Catalina', '351.00', '2026-10-30', 11, 1, NULL, '2026-08-06 17:13:52'),
(606, 'gasto', 'Cibertec Julio', '454.50', '2026-08-30', 6, 1, NULL, '2026-08-11 03:24:33'),
(645, 'gasto', 'Seguro Mamá', '120.00', '2026-08-15', 12, 1, NULL, '2026-08-24 23:31:44'),
(646, 'gasto', 'Seguro Mamá', '120.00', '2026-09-15', 12, 1, NULL, '2026-08-24 23:31:44'),
(647, 'gasto', 'Seguro Mamá', '120.00', '2026-10-15', 12, 1, NULL, '2026-08-24 23:31:44'),
(658, 'gasto', 'Departamento', '975.00', '2026-08-15', 14, 1, NULL, '2026-08-24 23:31:52'),
(659, 'gasto', 'Departamento', '975.00', '2026-09-15', 14, 1, NULL, '2026-08-24 23:31:52'),
(660, 'gasto', 'Departamento', '975.00', '2026-10-15', 14, 1, NULL, '2026-08-24 23:31:52'),
(671, 'gasto', 'Win', '119.00', '2026-08-30', 13, 1, NULL, '2026-08-24 23:32:02'),
(672, 'gasto', 'Win', '119.00', '2026-09-30', 13, 1, NULL, '2026-08-24 23:32:02'),
(673, 'gasto', 'Win', '119.00', '2026-10-30', 13, 1, NULL, '2026-08-24 23:32:02'),
(684, 'gasto', 'Entel', '38.00', '2026-08-30', 13, 1, NULL, '2026-08-24 23:32:11'),
(685, 'gasto', 'Entel', '38.00', '2026-09-30', 13, 1, NULL, '2026-08-24 23:32:11'),
(686, 'gasto', 'Entel', '38.00', '2026-10-30', 13, 1, NULL, '2026-08-24 23:32:11'),
(697, 'gasto', 'Ronald 8000', '250.00', '2026-08-30', 10, 1, NULL, '2026-08-24 23:32:24'),
(698, 'gasto', 'Ronald 8000', '250.00', '2026-09-30', 10, 1, NULL, '2026-08-24 23:32:24'),
(751, 'gasto', 'Cibertec José', '553.63', '2026-10-30', 6, 1, NULL, '2026-08-31 14:28:17'),
(799, 'gasto', 'Prestamo Kate', '118.50', '2026-10-30', 10, 1, NULL, '2026-09-07 13:12:02'),
(834, 'gasto', 'Préstamo de 1200', '120.00', '2026-09-15', 6, 1, NULL, '2026-09-15 13:57:13'),
(862, 'gasto', 'Suno', '37.00', '2026-09-30', 6, 1, NULL, '2026-09-20 15:26:43'),
(892, 'gasto', 'Ronald 8000', '250.00', '2026-10-05', 10, 1, NULL, '2026-10-09 18:43:51'),
(894, 'gasto', 'Préstamo dee 1200', '120.00', '2026-10-15', 6, 1, NULL, '2026-10-09 18:49:54'),
(929, 'gasto', 'Compra MC', '40.80', '2026-10-30', 6, 1, NULL, '2026-10-16 16:23:21'),
(947, 'gasto', 'Suno', '38.00', '2026-10-30', 6, 1, NULL, '2026-10-30 16:23:45');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `movimientos_recurrentes`
--

CREATE TABLE `movimientos_recurrentes` (
  `id` int(11) NOT NULL,
  `tipo` enum('gasto','ingreso') NOT NULL,
  `descripcion` varchar(255) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `dia_pago` int(11) NOT NULL,
  `categoria_id` int(11) DEFAULT NULL,
  `periodos` text DEFAULT NULL,
  `tipo_recurrencia` varchar(15) DEFAULT 'mensual',
  `creado_el` timestamp NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `sueldos_mes`
--

CREATE TABLE `sueldos_mes` (
  `id` int(11) NOT NULL,
  `anio` int(11) NOT NULL,
  `mes` int(11) NOT NULL,
  `sueldo_15` decimal(10,2) NOT NULL DEFAULT 1900.00,
  `sueldo_30` decimal(10,2) NOT NULL DEFAULT 1500.00,
  `creado_el` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `sueldos_mes`
--

INSERT INTO `sueldos_mes` (`id`, `anio`, `mes`, `sueldo_15`, `sueldo_30`, `creado_el`) VALUES
(1, 2026, 6, '1500.00', '1500.00', '2026-07-15 00:39:53'),
(6, 2026, 7, '1500.00', '1500.00', '2026-08-05 23:10:30'),
(17, 2026, 8, '1500.00', '1500.00', '2026-08-15 05:06:13'),
(18, 2026, 9, '1500.00', '1500.00', '2026-08-15 05:06:18'),
(19, 2026, 10, '1500.00', '1500.00', '2026-08-15 05:06:22'),
(20, 2026, 11, '1500.00', '1500.00', '2026-08-15 05:06:26'),
(21, 2026, 0, '0.00', '0.00', '2026-08-24 23:27:51'),
(22, 2027, 0, '1500.00', '1500.00', '2026-08-24 23:28:14'),
(24, 2026, 1, '0.00', '0.00', '2026-08-24 23:29:10'),
(25, 2026, 2, '0.00', '0.00', '2026-08-24 23:29:18'),
(26, 2026, 3, '0.00', '0.00', '2026-08-24 23:29:24'),
(27, 2026, 4, '0.00', '0.00', '2026-08-24 23:29:31'),
(28, 2026, 5, '0.00', '0.00', '2026-08-24 23:29:38'),
(29, 2027, 1, '1500.00', '1500.00', '2026-08-24 23:36:28'),
(30, 2027, 2, '1500.00', '1500.00', '2026-08-24 23:36:39'),
(31, 2027, 3, '1500.00', '1500.00', '2026-08-24 23:36:46'),
(32, 2027, 4, '1500.00', '1500.00', '2026-08-24 23:36:52'),
(33, 2027, 5, '1500.00', '1500.00', '2026-08-24 23:36:58'),
(34, 2027, 6, '1500.00', '1500.00', '2026-08-24 23:37:04'),
(35, 2027, 7, '1500.00', '1500.00', '2026-08-24 23:37:10');

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `categorias`
--
ALTER TABLE `categorias`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `nombre` (`nombre`);

--
-- Indices de la tabla `config_billetera`
--
ALTER TABLE `config_billetera`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `movimientos_agenda`
--
ALTER TABLE `movimientos_agenda`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_agenda_recurrente_fecha` (`recurrente_id`,`fecha`),
  ADD KEY `fk_agenda_categoria` (`categoria_id`),
  ADD KEY `idx_agenda_fecha` (`fecha`);

--
-- Indices de la tabla `movimientos_recurrentes`
--
ALTER TABLE `movimientos_recurrentes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_recurrentes_categoria` (`categoria_id`);

--
-- Indices de la tabla `sueldos_mes`
--
ALTER TABLE `sueldos_mes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_anio_mes` (`anio`,`mes`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `categorias`
--
ALTER TABLE `categorias`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT de la tabla `config_billetera`
--
ALTER TABLE `config_billetera`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de la tabla `movimientos_agenda`
--
ALTER TABLE `movimientos_agenda`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `movimientos_recurrentes`
--
ALTER TABLE `movimientos_recurrentes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `sueldos_mes`
--
ALTER TABLE `sueldos_mes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=36;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `movimientos_agenda`
--
ALTER TABLE `movimientos_agenda`
  ADD CONSTRAINT `fk_agenda_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_agenda_recurrente` FOREIGN KEY (`recurrente_id`) REFERENCES `movimientos_recurrentes` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `movimientos_recurrentes`
--
ALTER TABLE `movimientos_recurrentes`
  ADD CONSTRAINT `fk_recurrentes_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
