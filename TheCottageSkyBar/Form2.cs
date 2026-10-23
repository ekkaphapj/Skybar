using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Data.OleDb;

namespace TheCottageSkyBar
{
    public partial class Form2 : Form
    {
        public Form2()
        {
            InitializeComponent();
        }

        private void button2_Click(object sender, EventArgs e)
        {
            reset();
        }
        private void reset()
        {
            dataGridView1.DataSource = null;
            textBox1.Text = "";
            this.ActiveControl = textBox1;
        }

        private void button3_Click(object sender, EventArgs e)
        {
            this.Close();
        }

        private void Form2_Load(object sender, EventArgs e)
        {

        }

        private void loadReceipt()
        {
            dataGridView1.DataSource = null;
            string strProvider = Form1.connStringMain; ;
            OleDbConnection con = new OleDbConnection(strProvider);
            string strSQL = "SELECT Items.Name1 AS รายการ, Sell.Amount as จำนวน, Sell.Price as ยอดเงิน, Sell.Date1 as วันที่, Sell.Time1 as เวลา, Sell.Owner as บันทึกโดย, Sell.PaymentType as ชำระโดย FROM (Sell INNER JOIN Items ON Sell.ItemID = Items.ID) INNER JOIN Account ON Sell.OrderID = Account.BillID WHERE Sell.OrderID='"+textBox1.Text+"';";
            OleDbCommand cmd = new OleDbCommand(strSQL, con);
            con.Open();
            //MessageBox.Show("ok");
            cmd.CommandType = CommandType.Text;
            OleDbDataAdapter da = new OleDbDataAdapter(cmd);
            DataTable data = new DataTable();
            da.Fill(data);
            dataGridView1.DataSource = data;
            con.Close();
        }

        private void button1_Click(object sender, EventArgs e)
        {
            if (textBox1.Text!="")
            {
                loadReceipt();
            }
        }
    }
}
